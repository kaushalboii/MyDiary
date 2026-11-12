"use client";

import { useEffect, useRef, useState } from "react";
import { toggleTheme, useThemeMode } from "@/lib/theme";

const PULL_DETENT_PX = 24;
const MAX_PULL_PX = 48;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeMode();
  const isDark = theme === "dark";

  const [pullOffset, setPullOffset] = useState(0);
  const [swayDeg, setSwayDeg] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [springing, setSpringing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const toggledInDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function triggerPulseAnimation() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSpringing(true);
    setPullOffset(26);
    setSwayDeg(-3.5);
    timerRef.current = window.setTimeout(() => {
      setPullOffset(0);
      setSwayDeg(0);
      timerRef.current = window.setTimeout(() => {
        setSpringing(false);
      }, 420);
    }, 150);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startYRef.current = e.clientY;
    startXRef.current = e.clientX;
    draggedRef.current = false;
    toggledInDragRef.current = false;
    suppressClickRef.current = false;
    setSpringing(false);
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging || startYRef.current === null || startXRef.current === null) return;
    const rawDy = e.clientY - startYRef.current;
    const rawDx = e.clientX - startXRef.current;
    if (Math.abs(rawDy) > 4 || Math.abs(rawDx) > 4) draggedRef.current = true;
    const dampedY = Math.max(0, Math.min(MAX_PULL_PX, rawDy * 0.8));
    const dampedSway = Math.max(-10, Math.min(10, -rawDx * 0.22));
    setPullOffset(dampedY);
    setSwayDeg(dampedSway);

    if (!toggledInDragRef.current && dampedY >= PULL_DETENT_PX) {
      toggledInDragRef.current = true;
      toggleTheme();
    }
  }

  function finishDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    setDragging(false);
    startYRef.current = null;
    startXRef.current = null;
    if (draggedRef.current) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }
    setPullOffset(0);
    setSwayDeg(0);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    triggerPulseAnimation();
    toggleTheme();
  }

  const label = isDark
    ? "Pull rope to switch light mode on"
    : "Pull rope to switch dark mode on";

  const cordScaleY = 1 + pullOffset / 56;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      data-testid="theme-toggle"
      aria-label={label}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={handleClick}
      data-pulling={dragging || springing || pullOffset > 0 ? "true" : "false"}
      className={`pull-rope-toggle ${isDark ? "is-dark" : "is-light"} ${className}`.trim()}
    >
      <span className="pull-rope__cap" aria-hidden="true" />
      <span
        className="pull-rope__pendulum"
        aria-hidden="true"
        style={{
          transform: `rotate(${swayDeg.toFixed(2)}deg)`,
          transition: dragging
            ? "none"
            : "transform 520ms cubic-bezier(0.22, 1.4, 0.36, 1)",
        }}
      >
        <span
          className="pull-rope__track"
          style={{
            transform: `scaleY(${cordScaleY.toFixed(3)})`,
            transition: dragging
              ? "none"
              : "transform 480ms cubic-bezier(0.22, 1.4, 0.36, 1)",
          }}
        >
          <svg
            className="pull-rope__braid"
            width="14"
            height="62"
            viewBox="0 0 14 62"
            fill="none"
          >
            {/* Primary woven hemp twist */}
            <path
              d="M7 0 C10.6 4.2, 3.4 8.6, 7 13 C10.6 17.4, 3.4 21.8, 7 26.2 C10.6 30.6, 3.4 35, 7 39.4 C10.6 43.8, 3.4 48.2, 7 52.6 C9.8 55.8, 4.4 59, 7 62"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Counter-ply twisted highlight strand for braided texture */}
            <path
              d="M7 0 C3.6 4.2, 10.4 8.6, 7 13 C3.6 17.4, 10.4 21.8, 7 26.2 C3.6 30.6, 10.4 35, 7 39.4 C3.6 43.8, 10.4 48.2, 7 52.6 C4.4 55.8, 9.6 59, 7 62"
              stroke="var(--paper-light)"
              strokeOpacity="0.45"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span
          className="pull-rope__knob"
          style={{
            transform: `translate3d(0, ${pullOffset.toFixed(1)}px, 0)`,
            transition: dragging
              ? "none"
              : "transform 480ms cubic-bezier(0.22, 1.4, 0.36, 1), background-color 240ms ease, box-shadow 240ms ease",
          }}
        >
          <span className="pull-rope__ferrule" />
          <span className="pull-rope__bead" />
          <span className="pull-rope__tassel" />
        </span>
      </span>
      <span className="pull-rope__tooltip" aria-hidden="true">
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}
