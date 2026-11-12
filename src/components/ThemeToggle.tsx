"use client";

import { useEffect, useRef, useState } from "react";
import { toggleTheme, useThemeMode } from "@/lib/theme";

const PULL_DETENT_PX = 18;
const MAX_PULL_PX = 34;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeMode();
  const isDark = theme === "dark";

  const [pullOffset, setPullOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [springing, setSpringing] = useState(false);

  const startYRef = useRef<number | null>(null);
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
    setPullOffset(20);
    timerRef.current = window.setTimeout(() => {
      setPullOffset(0);
      timerRef.current = window.setTimeout(() => {
        setSpringing(false);
      }, 320);
    }, 140);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startYRef.current = e.clientY;
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
    if (!dragging || startYRef.current === null) return;
    const rawDy = e.clientY - startYRef.current;
    if (rawDy > 4) draggedRef.current = true;
    const damped = Math.max(0, Math.min(MAX_PULL_PX, rawDy * 0.78));
    setPullOffset(damped);

    if (!toggledInDragRef.current && damped >= PULL_DETENT_PX) {
      toggledInDragRef.current = true;
      toggleTheme();
    }
  }

  function finishDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    setDragging(false);
    startYRef.current = null;
    if (draggedRef.current) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }
    setPullOffset(0);
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

  const cordScaleY = 1 + pullOffset / 24;

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
        className="pull-rope__track"
        aria-hidden="true"
        style={{
          transform: `scaleY(${cordScaleY.toFixed(3)})`,
          transition: dragging
            ? "none"
            : "transform 420ms cubic-bezier(0.22, 1.4, 0.36, 1)",
        }}
      >
        <svg
          className="pull-rope__braid"
          width="8"
          height="28"
          viewBox="0 0 8 28"
          fill="none"
        >
          <path
            d="M4 0 C6.2 2.4, 1.8 4.8, 4 7.2 C6.2 9.6, 1.8 12, 4 14.4 C6.2 16.8, 1.8 19.2, 4 21.6 C5.8 23.8, 2.2 26, 4 28"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span
        className="pull-rope__knob"
        aria-hidden="true"
        style={{
          transform: `translate3d(0, ${pullOffset.toFixed(1)}px, 0)`,
          transition: dragging
            ? "none"
            : "transform 420ms cubic-bezier(0.22, 1.4, 0.36, 1), background-color 240ms ease, box-shadow 240ms ease",
        }}
      >
        <span className="pull-rope__ferrule" />
        <span className="pull-rope__bead" />
      </span>
      <span className="pull-rope__tooltip" aria-hidden="true">
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}
