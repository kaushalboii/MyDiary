"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DiaryBook, PaperStyle } from "@/lib/types";

export type BookSpread = {
  id: string;
  label?: string;
  left: ReactNode;
  right: ReactNode;
};

type FlipState = {
  from: number;
  to: number;
  direction: 1 | -1;
  progress: number;
};

function paperPatternStyle(paperStyle: PaperStyle | undefined): React.CSSProperties {
  if (paperStyle === "lined") {
    return {
      backgroundColor: "#fbf8f0",
      backgroundImage:
        "repeating-linear-gradient(to bottom, transparent 0px, transparent 30px, rgba(64, 56, 46, 0.085) 30px, rgba(64, 56, 46, 0.085) 31px)",
      backgroundPosition: "0 18px",
    };
  }
  if (paperStyle === "dotgrid") {
    return {
      backgroundColor: "#fbf8f0",
      backgroundImage:
        "radial-gradient(rgba(64, 56, 46, 0.18) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    };
  }
  return {
    backgroundColor: "#fbf8f0",
  };
}

function pageFontFamily(fontStyle: DiaryBook["fontStyle"]): string {
  if (fontStyle === "sans") return "var(--sans)";
  if (fontStyle === "mono") {
    return 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace';
  }
  return "var(--serif)";
}

export function FlipBookReader({
  book,
  spreads,
  activeIndex,
  onChangeIndex,
}: {
  book: DiaryBook;
  spreads: BookSpread[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const animRafRef = useRef<number>(0);

  const [flip, setFlip] = useState<FlipState | null>(null);
  const [hoverSide, setHoverSide] = useState<"left" | "right" | null>(null);
  const [isMobileSingle, setIsMobileSingle] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    direction: 1 | -1;
    targetIndex: number;
    moved: boolean;
    lastProgress: number;
  } | null>(null);

  const flipRef = useRef<FlipState | null>(null);
  flipRef.current = flip;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsMobileSingle(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRafRef.current);
    };
  }, []);

  const animateFlipTo = useCallback(
    (
      from: number,
      to: number,
      direction: 1 | -1,
      startProgress: number,
      complete: boolean,
    ) => {
      cancelAnimationFrame(animRafRef.current);
      const targetProgress = complete ? 1 : 0;
      const duration = Math.max(180, Math.abs(targetProgress - startProgress) * 480);
      const startedAt = performance.now();

      function tick(now: number) {
        const rawT = Math.min(1, (now - startedAt) / duration);
        // Smooth ease-out curve for natural paper settle
        const eased = 1 - Math.pow(1 - rawT, 3);
        const progress =
          startProgress + (targetProgress - startProgress) * eased;

        setFlip({ from, to, direction, progress });

        if (rawT < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          setFlip(null);
          if (complete) {
            onChangeIndex(to);
          }
        }
      }

      animRafRef.current = requestAnimationFrame(tick);
    },
    [onChangeIndex],
  );

  const turnPage = useCallback(
    (direction: 1 | -1, explicitTarget?: number) => {
      if (flipRef.current) return;
      const to =
        explicitTarget !== undefined
          ? Math.max(0, Math.min(spreads.length - 1, explicitTarget))
          : activeIndex + direction;
      if (to === activeIndex || to < 0 || to >= spreads.length) return;
      const effectiveDir: 1 | -1 = to > activeIndex ? 1 : -1;
      animateFlipTo(activeIndex, to, effectiveDir, 0, true);
    },
    [activeIndex, animateFlipTo, spreads.length],
  );

  // Sync keyboard ArrowLeft/ArrowRight cleanly to animated page turn
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        turnPage(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        turnPage(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turnPage]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isMobileSingle || flipRef.current || spreads.length <= 1) return;
    if (e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea, [data-no-flip]")) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const direction: 1 | -1 = relX >= 0.5 ? 1 : -1;
    const targetIndex = activeIndex + direction;
    if (targetIndex < 0 || targetIndex >= spreads.length) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      direction,
      targetIndex,
      moved: false,
      lastProgress: 0,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();

    if (!dragRef.current?.active) {
      if (isMobileSingle || flipRef.current) {
        if (hoverSide) setHoverSide(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, [data-no-flip]")) {
        if (hoverSide) setHoverSide(null);
        return;
      }
      const relX = (e.clientX - rect.left) / rect.width;
      if (relX > 0.72 && activeIndex < spreads.length - 1) {
        if (hoverSide !== "right") setHoverSide("right");
      } else if (relX < 0.28 && activeIndex > 0) {
        if (hoverSide !== "left") setHoverSide("left");
      } else if (hoverSide !== null) {
        setHoverSide(null);
      }
      return;
    }

    const drag = dragRef.current;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      // Abort drag if user is mostly scrolling vertically inside long notes
      if (Math.abs(dy) > Math.abs(dx) * 1.35) {
        dragRef.current = null;
        return;
      }
      drag.moved = true;
    }

    const directionalDelta = drag.direction === 1 ? -dx : dx;
    const progress = Math.max(
      0.02,
      Math.min(0.98, directionalDelta / Math.max(220, rect.width * 0.44)),
    );
    drag.lastProgress = progress;
    setHoverSide(null);
    setFlip({
      from: activeIndex,
      to: drag.targetIndex,
      direction: drag.direction,
      progress,
    });
  }

  function finishDrag(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = dragRef.current;
    if (!drag?.active) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(drag.pointerId)) {
      e.currentTarget.releasePointerCapture(drag.pointerId);
    }

    if (cancelled) {
      if (flipRef.current) {
        animateFlipTo(
          activeIndex,
          drag.targetIndex,
          drag.direction,
          drag.lastProgress,
          false,
        );
      }
      return;
    }

    const stage = stageRef.current;
    const rect = stage?.getBoundingClientRect();

    if (!drag.moved) {
      // Single click near left/right outer third turns page cleanly
      if (rect) {
        const relX = (e.clientX - rect.left) / rect.width;
        if (drag.direction === 1 && relX >= 0.65) {
          turnPage(1);
        } else if (drag.direction === -1 && relX <= 0.35) {
          turnPage(-1);
        }
      }
      return;
    }

    const shouldComplete = drag.lastProgress >= 0.28;
    animateFlipTo(
      activeIndex,
      drag.targetIndex,
      drag.direction,
      drag.lastProgress,
      shouldComplete,
    );
  }

  const thicknessLayers = book.thickness >= 0.3 ? 6 : book.thickness <= 0.15 ? 2 : 4;
  const pageEdgeShadow = Array.from({ length: thicknessLayers })
    .map((_, i) => {
      const offset = (i + 1) * 2;
      const color = i % 2 === 0 ? "#ebe3d2" : "#d5cbb6";
      return `${offset}px ${offset * 0.35}px 0 0 ${color}, -${offset}px ${offset * 0.35}px 0 0 ${color}`;
    })
    .join(", ");

  const safeIndex = Math.max(0, Math.min(spreads.length - 1, activeIndex));
  const currentSpread = spreads[safeIndex];
  const paperCss = paperPatternStyle(book.paperStyle);
  const framedInner = book.paperStyle === "framed";
  const fontCss = pageFontFamily(book.fontStyle);

  // Determine what sits underneath during active 3D flip
  const baseLeftContent =
    flip && flip.direction === -1
      ? spreads[flip.to]?.left
      : spreads[flip ? flip.from : safeIndex]?.left;
  const baseRightContent =
    flip && flip.direction === 1
      ? spreads[flip.to]?.right
      : spreads[flip ? flip.from : safeIndex]?.right;

  const shadowPeak = flip ? Math.sin(flip.progress * Math.PI) * 0.24 : 0;

  return (
    <div className="space-y-4">
      {/* Clothbound Hardcover Frame */}
      <div
        className="relative rounded-[10px] p-2.5 sm:p-4 lg:p-5 transition-colors duration-300 shadow-[0_32px_68px_-28px_rgba(37,35,31,0.56)]"
        style={{ backgroundColor: book.cover }}
      >
        {/* Ribbon Bookmark */}
        <div
          className="pointer-events-none absolute top-0 right-10 z-30 hidden sm:block h-10 w-3.5 shadow-sm"
          style={{
            backgroundColor: book.accent,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)",
          }}
          aria-hidden="true"
        />

        {isMobileSingle ? (
          /* Mobile / Narrow Portrait: Clean stacked single-sheet card flow with tactile paper */
          <div
            className="overflow-hidden rounded-[3px] border border-black/10"
            style={{ ...paperCss, fontFamily: fontCss }}
          >
            <div className="border-b border-[var(--hairline)] p-5 sm:p-8">
              <div
                className={
                  framedInner
                    ? "border border-[var(--hairline)]/80 p-4"
                    : ""
                }
              >
                {currentSpread?.left}
              </div>
            </div>
            <div className="bg-[#f5f0e5]/75 p-5 sm:p-8">
              <div
                className={
                  framedInner
                    ? "border border-[var(--hairline)]/80 p-4"
                    : ""
                }
              >
                {currentSpread?.right}
              </div>
            </div>
          </div>
        ) : (
          /* Desktop: Real Dual-Page Open Hardcover with Interactive 3D Page-Flipping Stage */
          <div
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
            onPointerLeave={() => {
              if (!dragRef.current) setHoverSide(null);
            }}
            className="relative select-none"
            style={{
              perspective: "2400px",
              boxShadow: pageEdgeShadow,
              fontFamily: fontCss,
              touchAction: "pan-y",
            }}
          >
            {/* Stationary Spread Base */}
            <div className="grid min-h-[580px] grid-cols-2 overflow-hidden rounded-[3px] border border-black/15">
              {/* Left Base Page */}
              <div
                className="relative min-h-[580px] overflow-y-auto p-8 lg:p-11"
                style={{
                  ...paperCss,
                  boxShadow:
                    "inset -26px 0 34px -26px rgba(37, 35, 31, 0.34), inset 0 0 0 1px rgba(37,35,31,0.05)",
                }}
              >
                <div
                  className={
                    framedInner
                      ? "min-h-full border border-[var(--hairline)]/80 p-5"
                      : "min-h-full"
                  }
                >
                  {baseLeftContent}
                </div>

                {/* Cast shadow when flipping backward */}
                {flip && flip.direction === -1 && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(28, 22, 16, ${shadowPeak * 0.55})`,
                    }}
                  />
                )}

                {/* Subtle left corner curl invite on hover */}
                {!flip && hoverSide === "left" && safeIndex > 0 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 h-12 w-12"
                    style={{
                      background:
                        "linear-gradient(225deg, transparent 50%, rgba(224,215,197,0.92) 52%, rgba(246,241,231,0.98) 100%)",
                      boxShadow: "3px -3px 10px rgba(37,35,31,0.18)",
                    }}
                  />
                )}
              </div>

              {/* Right Base Page */}
              <div
                className="relative min-h-[580px] overflow-y-auto p-8 lg:p-11"
                style={{
                  ...paperCss,
                  backgroundColor: "#f7f3e8",
                  boxShadow:
                    "inset 26px 0 34px -26px rgba(37, 35, 31, 0.3), inset 0 0 0 1px rgba(37,35,31,0.05)",
                }}
              >
                <div
                  className={
                    framedInner
                      ? "min-h-full border border-[var(--hairline)]/80 p-5"
                      : "min-h-full"
                  }
                >
                  {baseRightContent}
                </div>

                {/* Cast shadow when flipping forward */}
                {flip && flip.direction === 1 && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(28, 22, 16, ${shadowPeak * 0.55})`,
                    }}
                  />
                )}

                {/* Subtle right corner curl invite on hover */}
                {!flip && hoverSide === "right" && safeIndex < spreads.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 bottom-0 h-12 w-12"
                    style={{
                      background:
                        "linear-gradient(135deg, transparent 50%, rgba(224,215,197,0.92) 52%, rgba(246,241,231,0.98) 100%)",
                      boxShadow: "-3px -3px 10px rgba(37,35,31,0.18)",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Active Center Binding Gutter Highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-10 w-6 -translate-x-1/2"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(37,35,31,0.18) 50%, transparent)",
              }}
            />

            {/* 3D Turning Page Leaf */}
            {flip && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-1/2"
                style={{
                  left: flip.direction === 1 ? "50%" : "0%",
                  transformOrigin:
                    flip.direction === 1 ? "left center" : "right center",
                  transformStyle: "preserve-3d",
                  transform:
                    flip.direction === 1
                      ? `rotateY(${-flip.progress * 180}deg)`
                      : `rotateY(${flip.progress * 180}deg)`,
                }}
              >
                {/* Leaf Front Face */}
                <div
                  className="absolute inset-0 overflow-hidden p-8 lg:p-11"
                  style={{
                    ...paperCss,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    boxShadow:
                      flip.direction === 1
                        ? "inset 24px 0 30px -24px rgba(37,35,31,0.3), -6px 4px 20px rgba(37,35,31,0.14)"
                        : "inset -24px 0 30px -24px rgba(37,35,31,0.3), 6px 4px 20px rgba(37,35,31,0.14)",
                  }}
                >
                  <div
                    className={
                      framedInner
                        ? "min-h-full border border-[var(--hairline)]/80 p-5"
                        : "min-h-full"
                    }
                  >
                    {flip.direction === 1
                      ? spreads[flip.from]?.right
                      : spreads[flip.from]?.left}
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        flip.direction === 1
                          ? `linear-gradient(90deg, rgba(28,22,16,${shadowPeak * 0.4}) 0%, rgba(255,255,255,${shadowPeak * 0.35}) 55%, rgba(28,22,16,${shadowPeak * 0.7}) 100%)`
                          : `linear-gradient(270deg, rgba(28,22,16,${shadowPeak * 0.4}) 0%, rgba(255,255,255,${shadowPeak * 0.35}) 55%, rgba(28,22,16,${shadowPeak * 0.7}) 100%)`,
                    }}
                  />
                </div>

                {/* Leaf Back Face */}
                <div
                  className="absolute inset-0 overflow-hidden p-8 lg:p-11"
                  style={{
                    ...paperCss,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    boxShadow:
                      flip.direction === 1
                        ? "inset -24px 0 30px -24px rgba(37,35,31,0.3), 6px 4px 20px rgba(37,35,31,0.14)"
                        : "inset 24px 0 30px -24px rgba(37,35,31,0.3), -6px 4px 20px rgba(37,35,31,0.14)",
                  }}
                >
                  <div
                    className={
                      framedInner
                        ? "min-h-full border border-[var(--hairline)]/80 p-5"
                        : "min-h-full"
                    }
                  >
                    {flip.direction === 1
                      ? spreads[flip.to]?.left
                      : spreads[flip.to]?.right}
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(255, 252, 244, ${shadowPeak * 0.15})`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Natural Page Turn Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-[var(--ink-soft)]">
        <button
          type="button"
          disabled={safeIndex <= 0 || Boolean(flip)}
          onClick={() => turnPage(-1)}
          className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3.5 py-2 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Prev Page</span>
        </button>

        <span className="text-[11px] tracking-[0.14em] uppercase">
          {currentSpread?.label || `Spread ${safeIndex + 1} of ${spreads.length}`}
          <span className="hidden sm:inline opacity-60">
            {" "}
            · Drag page edge or use arrow keys to flip
          </span>
        </span>

        <button
          type="button"
          disabled={safeIndex >= spreads.length - 1 || Boolean(flip)}
          onClick={() => turnPage(1)}
          className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3.5 py-2 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <span>Next Page</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

