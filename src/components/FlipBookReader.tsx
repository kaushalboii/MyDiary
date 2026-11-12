"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveMediaUrl } from "@/lib/storage-client";
import type { DiaryBook, PaperStyle } from "@/lib/types";
import { createFrontCover } from "@/three/cover-art";

export type BookSpread = {
  id: string;
  label?: string;
  left: ReactNode;
  right: ReactNode;
};

type FlipState = {
  fromPage: number;
  toPage: number;
  direction: 1 | -1;
  progress: number;
};

function paperPatternStyle(paperStyle: PaperStyle | undefined): React.CSSProperties {
  if (paperStyle === "lined") {
    return {
      backgroundColor: "var(--page-bg)",
      backgroundImage:
        "repeating-linear-gradient(to bottom, transparent 0px, transparent 30px, var(--page-line) 30px, var(--page-line) 31px)",
      backgroundPosition: "0 18px",
    };
  }
  if (paperStyle === "dotgrid") {
    return {
      backgroundColor: "var(--page-bg)",
      backgroundImage: "radial-gradient(var(--page-dot) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    };
  }
  return {
    backgroundColor: "var(--page-bg)",
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
  opening: _opening = false,
}: {
  book: DiaryBook;
  spreads: BookSpread[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  opening?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const animRafRef = useRef<number>(0);
  const coverRafRef = useRef<number>(0);
  const coverCanvasRef = useRef<HTMLCanvasElement>(null);

  const [flip, setFlip] = useState<FlipState | null>(null);
  const [hoverSide, setHoverSide] = useState<"left" | "right" | null>(null);
  const [isMobileSingle, setIsMobileSingle] = useState(false);

  const [coverProgress, setCoverProgress] = useState(0);
  const [coverDone, setCoverDone] = useState(false);
  const [customCoverImg, setCustomCoverImg] = useState<HTMLImageElement | null>(null);
  const coverProgressRef = useRef(0);
  coverProgressRef.current = coverProgress;

  // On narrow screens, present individual pages sequentially at a constant locked size
  const [mobileSide, setMobileSide] = useState<0 | 1>(() =>
    activeIndex === 0 ? 1 : 0,
  );
  const internalNavRef = useRef<{ spread: number; side: 0 | 1 } | null>(null);
  const prevBookIdRef = useRef(book.id);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    direction: 1 | -1;
    fromPage: number;
    targetPage: number;
    moved: boolean;
    lastProgress: number;
  } | null>(null);

  const flipRef = useRef<FlipState | null>(null);
  flipRef.current = flip;

  const flatPages = useMemo(
    () =>
      spreads.flatMap((spread, sIdx) => [
        {
          spreadIndex: sIdx,
          side: 0 as const,
          label: spread.label || `Pages ${sIdx * 2 + 1}–${sIdx * 2 + 2}`,
          content: spread.left,
        },
        {
          spreadIndex: sIdx,
          side: 1 as const,
          label: spread.label || `Pages ${sIdx * 2 + 1}–${sIdx * 2 + 2}`,
          content: spread.right,
        },
      ]),
    [spreads],
  );

  const safeSpreadIndex = Math.max(0, Math.min(spreads.length - 1, activeIndex));
  const totalPages = flatPages.length;
  const currentMobilePage = Math.max(
    0,
    Math.min(totalPages - 1, safeSpreadIndex * 2 + mobileSide),
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsMobileSingle(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Cancel any mid-turn flip & replay real-time cover opening when switching books
  useEffect(() => {
    if (prevBookIdRef.current !== book.id) {
      prevBookIdRef.current = book.id;
      cancelAnimationFrame(animRafRef.current);
      cancelAnimationFrame(coverRafRef.current);
      setFlip(null);
      dragRef.current = null;
      internalNavRef.current = null;
      setMobileSide(safeSpreadIndex === 0 ? 1 : 0);
      coverProgressRef.current = 0;
      setCoverProgress(0);
      setCoverDone(false);
    }
  }, [book.id, safeSpreadIndex]);

  // Load optional custom book cover photo cleanly for real-time canvas rendering
  useEffect(() => {
    if (!book.coverImage || coverDone) {
      setCustomCoverImg(null);
      return;
    }
    const resolved = resolveMediaUrl(book.coverImage);
    if (!resolved) {
      setCustomCoverImg(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setCustomCoverImg(img);
    };
    img.onerror = () => {
      if (!cancelled) setCustomCoverImg(null);
    };
    img.src = resolved;
    return () => {
      cancelled = true;
    };
  }, [book.coverImage, coverDone]);

  // Render full-resolution cover canvas using exact shelf cover artwork
  useEffect(() => {
    if (coverDone) return;
    const canvas = coverCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rendered = createFrontCover(book, customCoverImg);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rendered, 0, 0, canvas.width, canvas.height);
  }, [book, customCoverImg, coverDone, isMobileSingle]);

  // Animate full-scale front cover opening in real time
  useEffect(() => {
    if (coverDone) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      coverProgressRef.current = 1;
      setCoverProgress(1);
      setCoverDone(true);
      return;
    }

    cancelAnimationFrame(coverRafRef.current);

    const startVal = coverProgressRef.current;
    const startedAt = performance.now();
    const duration = Math.max(460, Math.round((1 - startVal) * 760));

    const tickOpen = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const next = startVal + (1 - startVal) * eased;
      coverProgressRef.current = next;
      setCoverProgress(next);
      if (t < 1) {
        coverRafRef.current = requestAnimationFrame(tickOpen);
      } else {
        coverProgressRef.current = 1;
        setCoverProgress(1);
        setCoverDone(true);
      }
    };

    coverRafRef.current = requestAnimationFrame(tickOpen);
    return () => cancelAnimationFrame(coverRafRef.current);
  }, [book.id, coverDone]);

  // Sync mobile side when spread index changes externally (chapter link, URL, reset)
  useEffect(() => {
    const lastInternal = internalNavRef.current;
    if (lastInternal && lastInternal.spread === safeSpreadIndex) {
      setMobileSide(lastInternal.side);
      internalNavRef.current = null;
      return;
    }
    internalNavRef.current = null;
    setMobileSide(safeSpreadIndex === 0 ? 1 : 0);
  }, [safeSpreadIndex]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRafRef.current);
      cancelAnimationFrame(coverRafRef.current);
    };
  }, []);

  const commitPage = useCallback(
    (targetPage: number) => {
      if (isMobileSingle) {
        const clampedPage = Math.max(0, Math.min(totalPages - 1, targetPage));
        const nextSpread = Math.floor(clampedPage / 2);
        const nextSide = (clampedPage % 2) as 0 | 1;
        internalNavRef.current = { spread: nextSpread, side: nextSide };
        setMobileSide(nextSide);
        if (nextSpread !== safeSpreadIndex) {
          onChangeIndex(nextSpread);
        }
      } else {
        const clampedSpread = Math.max(0, Math.min(spreads.length - 1, targetPage));
        onChangeIndex(clampedSpread);
      }
    },
    [isMobileSingle, onChangeIndex, safeSpreadIndex, spreads.length, totalPages],
  );

  const animateFlipTo = useCallback(
    (
      fromPage: number,
      toPage: number,
      direction: 1 | -1,
      startProgress: number,
      complete: boolean,
    ) => {
      cancelAnimationFrame(animRafRef.current);
      const targetProgress = complete ? 1 : 0;
      const duration = Math.max(180, Math.abs(targetProgress - startProgress) * 460);
      const startedAt = performance.now();

      function tick(now: number) {
        const rawT = Math.min(1, (now - startedAt) / duration);
        // Smooth ease-out curve for natural paper settle
        const eased = 1 - Math.pow(1 - rawT, 3);
        const progress =
          startProgress + (targetProgress - startProgress) * eased;

        setFlip({ fromPage, toPage, direction, progress });

        if (rawT < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          setFlip(null);
          if (complete) {
            commitPage(toPage);
          }
        }
      }

      animRafRef.current = requestAnimationFrame(tick);
    },
    [commitPage],
  );

  const maxNavIndex = isMobileSingle ? totalPages - 1 : spreads.length - 1;
  const activeNavIndex = isMobileSingle ? currentMobilePage : safeSpreadIndex;

  const turnPage = useCallback(
    (direction: 1 | -1, explicitTarget?: number) => {
      if (!coverDone) {
        cancelAnimationFrame(coverRafRef.current);
        coverProgressRef.current = 1;
        setCoverProgress(1);
        setCoverDone(true);
      }
      if (flipRef.current) return;
      const from = isMobileSingle ? currentMobilePage : safeSpreadIndex;
      const maxIdx = isMobileSingle ? totalPages - 1 : spreads.length - 1;
      const to =
        explicitTarget !== undefined
          ? Math.max(0, Math.min(maxIdx, explicitTarget))
          : from + direction;
      if (to === from || to < 0 || to > maxIdx) return;
      const effectiveDir: 1 | -1 = to > from ? 1 : -1;
      animateFlipTo(from, to, effectiveDir, 0, true);
    },
    [
      animateFlipTo,
      currentMobilePage,
      isMobileSingle,
      safeSpreadIndex,
      spreads.length,
      totalPages,
    ],
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
    if (!coverDone) return;
    const count = isMobileSingle ? totalPages : spreads.length;
    if (flipRef.current || count <= 1) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea, [data-no-flip]")) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const fromPage = isMobileSingle ? currentMobilePage : safeSpreadIndex;
    const direction: 1 | -1 = relX >= 0.5 ? 1 : -1;
    const targetPage = fromPage + direction;

    if (e.pointerType === "mouse" && (targetPage < 0 || targetPage >= count)) {
      return;
    }

    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      direction,
      fromPage,
      targetPage,
      moved: false,
      lastProgress: 0,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const count = isMobileSingle ? totalPages : spreads.length;
    const currentIdx = isMobileSingle ? currentMobilePage : safeSpreadIndex;

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
      if (relX > 0.72 && currentIdx < count - 1) {
        if (hoverSide !== "right") setHoverSide("right");
      } else if (relX < 0.28 && currentIdx > 0) {
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
      if (Math.hypot(dx, dy) < 8) return;
      // Abort drag if user is scrolling vertically inside long notes
      if (Math.abs(dy) >= Math.abs(dx) * 1.15) {
        dragRef.current = null;
        return;
      }
      // On touch swipe, infer direction cleanly from horizontal swipe vector
      if (isMobileSingle) {
        const swipeDir: 1 | -1 = dx < 0 ? 1 : -1;
        const candidateTarget = drag.fromPage + swipeDir;
        if (candidateTarget < 0 || candidateTarget >= count) {
          dragRef.current = null;
          return;
        }
        drag.direction = swipeDir;
        drag.targetPage = candidateTarget;
      }
      drag.moved = true;
      try {
        e.currentTarget.setPointerCapture(drag.pointerId);
      } catch {
        // Ignore if pointer already lifted
      }
    }

    const directionalDelta = drag.direction === 1 ? -dx : dx;
    const progress = Math.max(
      0.02,
      Math.min(0.98, directionalDelta / Math.max(160, rect.width * 0.44)),
    );
    drag.lastProgress = progress;
    setHoverSide(null);
    setFlip({
      fromPage: drag.fromPage,
      toPage: drag.targetPage,
      direction: drag.direction,
      progress,
    });
  }

  function finishDrag(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = dragRef.current;
    if (!drag?.active) return;
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(drag.pointerId)) {
        e.currentTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // Ignore invalid pointer capture handle
    }

    if (cancelled) {
      if (flipRef.current) {
        animateFlipTo(
          drag.fromPage,
          drag.targetPage,
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
      if (rect && !isMobileSingle) {
        const relX = (e.clientX - rect.left) / rect.width;
        if (drag.direction === 1 && relX >= 0.65) {
          turnPage(1);
        } else if (drag.direction === -1 && relX <= 0.35) {
          turnPage(-1);
        }
      }
      return;
    }

    const shouldComplete = drag.lastProgress >= 0.25;
    animateFlipTo(
      drag.fromPage,
      drag.targetPage,
      drag.direction,
      drag.lastProgress,
      shouldComplete,
    );
  }

  const thicknessLayers = book.thickness >= 0.3 ? 6 : book.thickness <= 0.15 ? 2 : 4;
  const pageEdgeShadow = Array.from({ length: thicknessLayers })
    .map((_, i) => {
      const offset = (i + 1) * 2;
      const color = i % 2 === 0 ? "var(--page-edge-a)" : "var(--page-edge-b)";
      return isMobileSingle
        ? `${offset}px ${offset * 0.35}px 0 0 ${color}`
        : `${offset}px ${offset * 0.35}px 0 0 ${color}, -${offset}px ${offset * 0.35}px 0 0 ${color}`;
    })
    .join(", ");

  const currentSpread = spreads[safeSpreadIndex];
  const paperCss = paperPatternStyle(book.paperStyle);
  const framedInner = book.paperStyle === "framed";
  const fontCss = pageFontFamily(book.fontStyle);

  // Determine what sits underneath during active 3D flip (Desktop)
  const baseLeftContent =
    flip && flip.direction === -1
      ? spreads[flip.toPage]?.left
      : spreads[flip ? flip.fromPage : safeSpreadIndex]?.left;
  const baseRightContent =
    flip && flip.direction === 1
      ? spreads[flip.toPage]?.right
      : spreads[flip ? flip.fromPage : safeSpreadIndex]?.right;

  // Determine mobile base & turning single pages
  const mobileBaseContent = flip
    ? flatPages[flip.toPage]?.content
    : flatPages[currentMobilePage]?.content;
  const mobileFlippingContent = flip
    ? flatPages[flip.fromPage]?.content
    : null;

  const shadowPeak = flip ? Math.sin(flip.progress * Math.PI) * 0.24 : 0;
  const coverAngleDesktop = -180 * coverProgress;
  const coverAngleMobile = -115 * coverProgress;
  const desktopShiftPct = !isMobileSingle && !coverDone ? -25 * (1 - coverProgress) : 0;
  const leftBoardReveal =
    coverDone || isMobileSingle
      ? 1
      : coverProgress < 0.38
        ? 0
        : Math.min(1, (coverProgress - 0.38) / 0.28);
  const coverFadeOutDesktop =
    coverProgress > 0.86 ? Math.max(0, 1 - (coverProgress - 0.86) / 0.14) : 1;
  const coverFadeOutMobile =
    coverProgress > 0.64 ? Math.max(0, 1 - (coverProgress - 0.64) / 0.36) : 1;

  const activeStageShadow =
    !isMobileSingle && !coverDone && coverProgress < 0.45
      ? Array.from({ length: thicknessLayers })
          .map((_, i) => {
            const offset = (i + 1) * 2;
            const color = i % 2 === 0 ? "var(--page-edge-a)" : "var(--page-edge-b)";
            return `${offset}px ${offset * 0.35}px 0 0 ${color}`;
          })
          .join(", ")
      : pageEdgeShadow;

  const finishCoverNow = () => {
    cancelAnimationFrame(coverRafRef.current);
    coverProgressRef.current = 1;
    setCoverProgress(1);
    setCoverDone(true);
  };

  return (
    <div className="space-y-4 overflow-x-clip">
      {/* Clothbound Hardcover Frame — constant full width & fixed locked stage height */}
      <div
        className="relative w-full rounded-2xl p-2.5 sm:p-4 lg:p-5 transition-[transform] duration-75 will-change-transform"
        style={{
          backgroundColor: coverDone || isMobileSingle ? book.cover : "transparent",
          boxShadow:
            coverDone || isMobileSingle
              ? "0 28px 60px -30px rgba(0,0,0,0.45)"
              : undefined,
          transform:
            !isMobileSingle && !coverDone
              ? `translate3d(${desktopShiftPct}%, 0, 0)`
              : undefined,
        }}
      >
        {/* Split Desktop Hardcover Halves during Real-Time Opening */}
        {!coverDone && !isMobileSingle && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 left-0 w-1/2 rounded-l-2xl"
              style={{
                backgroundColor: book.cover,
                opacity: leftBoardReveal,
                boxShadow: "-12px 28px 54px -26px rgba(0,0,0,0.45)",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 bottom-0 w-1/2 rounded-r-2xl"
              style={{
                backgroundColor: book.cover,
                boxShadow: "10px 28px 58px -24px rgba(0,0,0,0.48)",
              }}
            />
          </>
        )}

        {/* Ribbon Bookmark */}
        <div
          className="pointer-events-none absolute top-0 right-10 z-30 hidden sm:block h-10 w-3.5 shadow-sm transition-opacity duration-200"
          style={{
            backgroundColor: book.accent,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)",
            opacity: coverDone ? 1 : Math.max(0, (coverProgress - 0.55) / 0.35),
          }}
          aria-hidden="true"
        />

        {isMobileSingle ? (
          /* Mobile / Narrow Portrait: Single Fixed-Size Sheet with Real-Time Cover Opening + 3D Page Turn */
          <div
            ref={stageRef}
            data-testid="flipbook-stage"
            data-flipping={flip ? "true" : "false"}
            data-opening={coverDone ? "false" : "true"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
            className="relative w-full select-none"
            style={{
              perspective: "2600px",
              boxShadow: pageEdgeShadow,
              fontFamily: fontCss,
              color: "var(--page-ink)",
              touchAction: "pan-y",
            }}
          >
            <div className="relative h-[500px] sm:h-[540px] w-full overflow-hidden rounded-lg ring-1 ring-black/15">
              {/* Stationary Target Sheet Underneath */}
              <div
                data-testid="flipbook-mobile-page"
                className="relative h-full w-full overflow-y-auto overflow-x-hidden flip-page-scroll p-6 sm:p-8"
                style={{
                  ...paperCss,
                  boxShadow:
                    "inset 18px 0 28px -22px rgba(0, 0, 0, 0.22), inset 0 0 0 1px rgba(0, 0, 0, 0.04)",
                }}
              >
                <div
                  className={
                    framedInner
                      ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-4"
                      : "flex min-h-full w-full flex-col"
                  }
                >
                  {mobileBaseContent}
                </div>

                {flip && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(18, 15, 12, ${shadowPeak * 0.42})`,
                    }}
                  />
                )}
              </div>

              {/* Left Spine Crease */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-4"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0, 0, 0, 0.14), transparent)",
                }}
              />

              {/* Full-Scale Real Cover Board Opening on Mobile */}
              {!coverDone && (
                <div
                  data-testid="flipbook-cover-opening"
                  onClick={finishCoverNow}
                  className="absolute inset-0 z-30 cursor-pointer overflow-hidden rounded-lg"
                  style={{
                    transformOrigin: "left center",
                    transformStyle: "preserve-3d",
                    willChange: "transform, opacity",
                    transform: `translate3d(0, 0, 4px) rotateY(${coverAngleMobile}deg)`,
                    opacity: coverFadeOutMobile,
                    boxShadow:
                      "inset 10px 0 18px -8px rgba(255,255,255,0.22), 14px 16px 34px -10px rgba(0,0,0,0.42)",
                  }}
                >
                  <canvas
                    ref={coverCanvasRef}
                    width={512}
                    height={768}
                    className="block h-full w-full object-cover"
                    aria-label={`${book.title} cover`}
                  />
                </div>
              )}

              {/* Hinged 3D Turning Single Leaf */}
              {flip && mobileFlippingContent && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                  style={{
                    transformOrigin: "left center",
                    transformStyle: "preserve-3d",
                    willChange: "transform, opacity",
                    transform:
                      flip.direction === 1
                        ? `translate3d(0, 0, 2px) rotateY(${-flip.progress * 105}deg)`
                        : `translate3d(0, 0, 2px) rotateY(${-(1 - flip.progress) * 105}deg)`,
                    opacity:
                      flip.direction === 1
                        ? Math.max(0, 1 - Math.max(0, flip.progress - 0.65) / 0.35)
                        : Math.max(0, 1 - Math.max(0, 0.35 - flip.progress) / 0.35),
                  }}
                >
                  <div
                    className="h-full w-full overflow-hidden p-6 sm:p-8"
                    style={{
                      ...paperCss,
                      boxShadow:
                        "inset 20px 0 28px -22px rgba(0,0,0,0.22), 10px 6px 24px rgba(0,0,0,0.18)",
                    }}
                  >
                    <div
                      className={
                        framedInner
                          ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-4"
                          : "flex min-h-full w-full flex-col"
                      }
                    >
                      {flip.direction === 1
                        ? mobileFlippingContent
                        : flatPages[flip.toPage]?.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Desktop: Real Dual-Page Open Hardcover with Real-Time Cover Opening & 3D Page Flipping */
          <div
            ref={stageRef}
            data-testid="flipbook-stage"
            data-flipping={flip ? "true" : "false"}
            data-opening={coverDone ? "false" : "true"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
            onPointerLeave={() => {
              if (!dragRef.current) setHoverSide(null);
            }}
            className="relative w-full select-none"
            style={{
              perspective: "3200px",
              boxShadow: activeStageShadow,
              fontFamily: fontCss,
              color: "var(--page-ink)",
              touchAction: "pan-y",
            }}
          >
            {/* Stationary Spread Base — exact invariant height & 50/50 split */}
            <div className="grid h-[580px] lg:h-[630px] w-full grid-cols-2 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg">
              {/* Left Base Page */}
              <div
                data-testid="flipbook-page-left"
                className="relative h-full w-full overflow-y-auto overflow-x-hidden flip-page-scroll p-7 lg:p-11"
                style={{
                  ...paperCss,
                  opacity: leftBoardReveal,
                  boxShadow:
                    "inset -26px 0 34px -26px rgba(0, 0, 0, 0.22), inset 0 0 0 1px rgba(0, 0, 0, 0.08)",
                }}
              >
                <div
                  className={
                    framedInner
                      ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-5"
                      : "flex min-h-full w-full flex-col"
                  }
                >
                  {baseLeftContent}
                </div>

                {/* Cast shadow when flipping backward */}
                {flip && flip.direction === -1 && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(18, 15, 12, ${shadowPeak * 0.45})`,
                    }}
                  />
                )}

                {/* Subtle left corner curl invite on hover */}
                {!flip && coverDone && hoverSide === "left" && safeSpreadIndex > 0 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 h-12 w-12"
                    style={{
                      background:
                        "linear-gradient(225deg, transparent 50%, var(--page-edge-b) 52%, var(--page-bg) 100%)",
                      boxShadow: "3px -3px 10px rgba(0,0,0,0.12)",
                    }}
                  />
                )}
              </div>

              {/* Right Base Page */}
              <div
                data-testid="flipbook-page-right"
                className="relative h-full w-full overflow-y-auto overflow-x-hidden flip-page-scroll p-7 lg:p-11"
                style={{
                  ...paperCss,
                  boxShadow:
                    "inset 26px 0 34px -26px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(0, 0, 0, 0.08)",
                }}
              >
                <div
                  className={
                    framedInner
                      ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-5"
                      : "flex min-h-full w-full flex-col"
                  }
                >
                  {baseRightContent}
                </div>

                {/* Cast shadow when flipping forward */}
                {flip && flip.direction === 1 && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(18, 15, 12, ${shadowPeak * 0.45})`,
                    }}
                  />
                )}

                {/* Subtle right corner curl invite on hover */}
                {!flip &&
                  coverDone &&
                  hoverSide === "right" &&
                  safeSpreadIndex < spreads.length - 1 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 bottom-0 h-12 w-12"
                      style={{
                        background:
                          "linear-gradient(135deg, transparent 50%, var(--page-edge-b) 52%, var(--page-bg) 100%)",
                        boxShadow: "-3px -3px 10px rgba(0,0,0,0.12)",
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
                opacity: leftBoardReveal,
                background:
                  "linear-gradient(90deg, transparent, rgba(0,0,0,0.14) 50%, transparent)",
              }}
            />

            {/* Full-Scale 3D Front Hardcover Swinging Open in Real Time */}
            {!coverDone && (
              <div
                data-testid="flipbook-cover-opening"
                onClick={finishCoverNow}
                className="absolute top-0 bottom-0 left-1/2 z-30 w-1/2 cursor-pointer"
                style={{
                  transformOrigin: "left center",
                  transformStyle: "preserve-3d",
                  willChange: "transform, opacity",
                  transform: `translate3d(0, 0, 8px) rotateY(${coverAngleDesktop}deg)`,
                  opacity: coverFadeOutDesktop,
                }}
              >
                {/* Outer Clothbound Artwork Face */}
                <div
                  className="absolute inset-0 overflow-hidden rounded-r-xl"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    backgroundColor: book.cover,
                    boxShadow:
                      "inset 12px 0 22px -10px rgba(255,255,255,0.22), inset 2px 0 8px rgba(0,0,0,0.32), 18px 24px 48px -14px rgba(0,0,0,0.45)",
                  }}
                >
                  <canvas
                    ref={coverCanvasRef}
                    width={512}
                    height={768}
                    className="block h-full w-full object-cover"
                    aria-label={`${book.title} cover`}
                  />
                  {/* Tactile spine groove */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 bottom-0 left-2.5 w-0.5 bg-black/15"
                  />
                </div>

                {/* Inside Hardcover Endpaper */}
                <div
                  className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-l-xl p-10"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    backgroundColor: book.cover,
                    boxShadow:
                      "inset -18px 0 28px -18px rgba(0,0,0,0.25), -8px 16px 34px -14px rgba(0,0,0,0.26)",
                  }}
                >
                  <div
                    className="flex h-full w-full flex-col justify-between border p-8"
                    style={{
                      backgroundColor: "var(--page-bg)",
                      borderColor: book.accent,
                    }}
                  >
                    <span
                      className="text-[10px] tracking-[0.26em] uppercase opacity-70"
                      style={{ color: "var(--page-ink)" }}
                    >
                      {book.coverImprint || "PERSONAL ARCHIVE"}
                    </span>
                    <div className="space-y-2">
                      <p
                        className="m-0 text-3xl font-normal leading-tight"
                        style={{ color: "var(--page-ink)", fontFamily: "var(--serif)" }}
                      >
                        {book.title}
                      </p>
                      {book.subtitle ? (
                        <p className="m-0 text-sm opacity-75" style={{ color: "var(--page-ink)" }}>
                          {book.subtitle}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className="text-[10px] tracking-[0.22em] uppercase opacity-55"
                      style={{ color: "var(--page-ink)" }}
                    >
                      {book.yearLabel}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3D Turning Page Leaf */}
            {flip && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-1/2 h-full"
                style={{
                  left: flip.direction === 1 ? "50%" : "0%",
                  transformOrigin:
                    flip.direction === 1 ? "left center" : "right center",
                  transformStyle: "preserve-3d",
                  willChange: "transform",
                  transform:
                    flip.direction === 1
                      ? `translate3d(0, 0, 2px) rotateY(${-flip.progress * 180}deg)`
                      : `translate3d(0, 0, 2px) rotateY(${flip.progress * 180}deg)`,
                }}
              >
                {/* Leaf Front Face */}
                <div
                  className="absolute inset-0 overflow-hidden p-7 lg:p-11"
                  style={{
                    ...paperCss,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    boxShadow:
                      flip.direction === 1
                        ? "inset 24px 0 30px -24px rgba(0,0,0,0.22), -6px 4px 20px rgba(0,0,0,0.12)"
                        : "inset -24px 0 30px -24px rgba(0,0,0,0.22), 6px 4px 20px rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    className={
                      framedInner
                        ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-5"
                        : "flex min-h-full w-full flex-col"
                    }
                  >
                    {flip.direction === 1
                      ? spreads[flip.fromPage]?.right
                      : spreads[flip.fromPage]?.left}
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        flip.direction === 1
                          ? `linear-gradient(90deg, rgba(18,15,12,${shadowPeak * 0.34}) 0%, rgba(255,255,255,${shadowPeak * 0.18}) 55%, rgba(18,15,12,${shadowPeak * 0.52}) 100%)`
                          : `linear-gradient(270deg, rgba(18,15,12,${shadowPeak * 0.34}) 0%, rgba(255,255,255,${shadowPeak * 0.18}) 55%, rgba(18,15,12,${shadowPeak * 0.52}) 100%)`,
                    }}
                  />
                </div>

                {/* Leaf Back Face */}
                <div
                  className="absolute inset-0 overflow-hidden p-7 lg:p-11"
                  style={{
                    ...paperCss,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    boxShadow:
                      flip.direction === 1
                        ? "inset -24px 0 30px -24px rgba(0,0,0,0.22), 6px 4px 20px rgba(0,0,0,0.12)"
                        : "inset 24px 0 30px -24px rgba(0,0,0,0.22), -6px 4px 20px rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    className={
                      framedInner
                        ? "flex min-h-full w-full flex-col rounded-md border border-[var(--hairline)] p-5"
                        : "flex min-h-full w-full flex-col"
                    }
                  >
                    {flip.direction === 1
                      ? spreads[flip.toPage]?.left
                      : spreads[flip.toPage]?.right}
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `rgba(255, 253, 248, ${shadowPeak * 0.08})`,
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
          data-testid="flipbook-prev"
          disabled={activeNavIndex <= 0 || Boolean(flip)}
          onClick={() => turnPage(-1)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-2 text-[11px] font-semibold tracking-wider text-[var(--ink)] uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Prev Page</span>
        </button>

        <span
          data-testid="flipbook-indicator"
          className="text-[11px] tracking-[0.14em] uppercase"
        >
          {isMobileSingle
            ? `Page ${String(currentMobilePage + 1).padStart(2, "0")} of ${String(totalPages).padStart(2, "0")} · ${currentSpread?.label || ""}`
            : currentSpread?.label ||
              `Spread ${safeSpreadIndex + 1} of ${spreads.length}`}
          <span className="hidden sm:inline opacity-60">
            {" "}
            · Drag page edge or use arrow keys to flip
          </span>
        </span>

        <button
          type="button"
          data-testid="flipbook-next"
          disabled={activeNavIndex >= maxNavIndex || Boolean(flip)}
          onClick={() => turnPage(1)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-2 text-[11px] font-semibold tracking-wider text-[var(--ink)] uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <span>Next Page</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
