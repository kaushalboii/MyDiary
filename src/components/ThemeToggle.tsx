"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toggleTheme, useThemeMode } from "@/lib/theme";

type RopeNode = {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
};

type RopeRenderState = {
  pathD: string;
  braidHighlightD: string;
  tipX: number;
  tipY: number;
  angleDeg: number;
  stretchRatio: number;
};

const NODE_COUNT = 6;
const SEG_LEN_DESKTOP = 11.4;
const SEG_LEN_MOBILE = 8.8;
const PULL_DETENT_PX = 20;
const MAX_EXTENSION_PX = 52;
const GRAVITY = 0.62;
const DAMPING = 0.984;
const CONSTRAINT_ITERS = 7;

function createRestNodes(segLen: number): RopeNode[] {
  return Array.from({ length: NODE_COUNT }, (_, i) => ({
    x: 0,
    y: i * segLen,
    prevX: 0,
    prevY: i * segLen,
  }));
}

function buildSmoothRopePath(nodes: RopeNode[]): string {
  if (nodes.length < 2) return "M 0 0 L 0 56";
  let d = `M ${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(2)}`;
  for (let i = 1; i < nodes.length - 1; i++) {
    const midX = (nodes[i].x + nodes[i + 1].x) * 0.5;
    const midY = (nodes[i].y + nodes[i + 1].y) * 0.5;
    d += ` Q ${nodes[i].x.toFixed(2)} ${nodes[i].y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = nodes[nodes.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

function computeRenderState(nodes: RopeNode[], restLength: number): RopeRenderState {
  const pathD = buildSmoothRopePath(nodes);
  const tip = nodes[nodes.length - 1];
  const prev = nodes[nodes.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  // Angle from downward vertical (0deg = hanging straight down, positive = swung left/CCW)
  const angleDeg = (Math.atan2(-dx, Math.max(2, dy)) * 180) / Math.PI;
  const distFromAnchor = Math.hypot(tip.x, tip.y);
  const stretchRatio = Math.max(0, Math.min(1, (distFromAnchor - restLength) / MAX_EXTENSION_PX));
  return {
    pathD,
    braidHighlightD: pathD,
    tipX: tip.x,
    tipY: tip.y,
    angleDeg: Math.max(-78, Math.min(78, angleDeg)),
    stretchRatio,
  };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeMode();
  const isDark = theme === "dark";
  const uid = useId().replace(/:/g, "");

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const segLenRef = useRef(SEG_LEN_DESKTOP);
  const nodesRef = useRef<RopeNode[]>(createRestNodes(SEG_LEN_DESKTOP));
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const draggingRef = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragTargetRef = useRef<{ x: number; y: number } | null>(null);
  const startClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const movedDuringDragRef = useRef(false);
  const toggledInDragRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const lastHoverPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const [dragging, setDragging] = useState(false);
  const [swaying, setSwaying] = useState(false);
  const [ropeState, setRopeState] = useState<RopeRenderState>(() =>
    computeRenderState(createRestNodes(SEG_LEN_DESKTOP), SEG_LEN_DESKTOP * (NODE_COUNT - 1)),
  );

  // Sync mobile/desktop cord length cleanly on viewport resize
  useEffect(() => {
    function syncScale() {
      const mobile = window.innerWidth <= 760;
      const nextSeg = mobile ? SEG_LEN_MOBILE : SEG_LEN_DESKTOP;
      if (Math.abs(nextSeg - segLenRef.current) > 0.1) {
        segLenRef.current = nextSeg;
        nodesRef.current = createRestNodes(nextSeg);
        setRopeState(computeRenderState(nodesRef.current, nextSeg * (NODE_COUNT - 1)));
      }
    }
    syncScale();
    window.addEventListener("resize", syncScale, { passive: true });
    return () => window.removeEventListener("resize", syncScale);
  }, []);

  const stepPhysics = useCallback(function step(now: number) {
    const dtMs = lastFrameTimeRef.current ? Math.min(34, now - lastFrameTimeRef.current) : 16.67;
    lastFrameTimeRef.current = now;
    const stepScale = dtMs / 16.67;

    const nodes = nodesRef.current;
    const baseSeg = segLenRef.current;
    const restLen = baseSeg * (NODE_COUNT - 1);

    // Compute dynamic elastic segment length when pulled taut past rest length
    const dragTarget = dragTargetRef.current;
    let activeSeg = baseSeg;
    if (draggingRef.current && dragTarget) {
      const targetDist = Math.min(
        restLen + MAX_EXTENSION_PX,
        Math.hypot(dragTarget.x, dragTarget.y),
      );
      if (targetDist > restLen) {
        activeSeg = targetDist / (NODE_COUNT - 1);
      }
    }

    // Anchor node 0 pinned under brass ceiling cap
    nodes[0].x = 0;
    nodes[0].y = 0;
    nodes[0].prevX = 0;
    nodes[0].prevY = 0;

    // Verlet integration for free nodes
    for (let i = 1; i < nodes.length; i++) {
      if (draggingRef.current && i === nodes.length - 1 && dragTarget) continue;
      const n = nodes[i];
      const vx = (n.x - n.prevX) * DAMPING;
      const vy = (n.y - n.prevY) * DAMPING;
      n.prevX = n.x;
      n.prevY = n.y;
      n.x += vx;
      n.y += vy + GRAVITY * stepScale * stepScale;
    }

    // Distance & ceiling/wall constraints
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      nodes[0].x = 0;
      nodes[0].y = 0;

      if (draggingRef.current && dragTarget) {
        const tip = nodes[nodes.length - 1];
        const dist = Math.hypot(dragTarget.x, dragTarget.y);
        const maxReach = restLen + MAX_EXTENSION_PX;
        if (dist > maxReach && dist > 0.001) {
          tip.x = (dragTarget.x / dist) * maxReach;
          tip.y = (dragTarget.y / dist) * maxReach;
        } else {
          tip.x = dragTarget.x;
          tip.y = dragTarget.y;
        }
        // Prevent dragging above ceiling line
        if (tip.y < 10) tip.y = 10;
      }

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - activeSeg) / d;
        const aPinned = i === 0;
        const bPinned = draggingRef.current && i + 1 === nodes.length - 1 && Boolean(dragTarget);

        if (aPinned && bPinned) {
          // Both ends fixed
        } else if (aPinned) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else if (bPinned) {
          a.x += dx * diff;
          a.y += dy * diff;
        } else {
          a.x += dx * 0.5 * diff;
          a.y += dy * 0.5 * diff;
          b.x -= dx * 0.5 * diff;
          b.y -= dy * 0.5 * diff;
        }
      }

      // Soft ceiling clearance so mid-knots don't clip into top bar
      for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].y < 4) {
          nodes[i].y = 4;
        }
      }
    }

    setRopeState(computeRenderState(nodes, restLen));

    // Sleep check when rope comes to natural rest
    let energy = 0;
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      energy += Math.abs(n.x - n.prevX) + Math.abs(n.y - n.prevY);
      energy += Math.abs(n.x) * 0.04;
    }

    if (draggingRef.current || energy > 0.06) {
      setSwaying(true);
      rafRef.current = requestAnimationFrame(step);
    } else {
      // Snap settle cleanly at rest vertical
      nodesRef.current = createRestNodes(baseSeg);
      setRopeState(computeRenderState(nodesRef.current, restLen));
      setSwaying(false);
      rafRef.current = null;
      lastFrameTimeRef.current = 0;
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null) {
      lastFrameTimeRef.current = 0;
      setSwaying(true);
      rafRef.current = requestAnimationFrame(stepPhysics);
    }
  }, [stepPhysics]);

  const applyImpulse = useCallback(
    (vx: number, vy: number) => {
      const nodes = nodesRef.current;
      const maxWeight = nodes.length - 1;
      for (let i = 1; i < nodes.length; i++) {
        const w = (i / maxWeight) ** 1.15;
        // Verlet stores velocity implicitly in (x - prevX)
        nodes[i].prevX -= vx * w * 0.45;
        nodes[i].prevY -= vy * w * 0.45;
      }
      ensureLoop();
    },
    [ensureLoop],
  );

  const clientToAnchorCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current || buttonRef.current;
    if (!svg) return { x: 0, y: segLenRef.current * (NODE_COUNT - 1) };
    const rect = svg.getBoundingClientRect();
    const anchorX = rect.left + rect.width * 0.5;
    const anchorY = rect.top + 6;
    return {
      x: clientX - anchorX,
      y: Math.max(10, clientY - anchorY),
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const finishDrag = useCallback(
    (canceled: boolean) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragTargetRef.current = null;
      dragPointerIdRef.current = null;
      setDragging(false);

      if (!canceled && !movedDuringDragRef.current) {
        toggleTheme();
        applyImpulse((Math.random() > 0.5 ? 1 : -1) * 5.2, 6.5);
      } else if (!canceled) {
        // Gentle elastic rebound on release
        applyImpulse(0, -3.2);
      }
      ensureLoop();
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 60);
    },
    [applyImpulse, ensureLoop],
  );

  // Global pointer listeners during active drag so fast throws outside button never get stuck
  useEffect(() => {
    if (!dragging) return;

    function onWindowMove(e: PointerEvent) {
      if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) {
        return;
      }
      const dxScreen = e.clientX - startClientRef.current.x;
      const dyScreen = e.clientY - startClientRef.current.y;
      if (Math.hypot(dxScreen, dyScreen) > 6) {
        movedDuringDragRef.current = true;
      }

      const local = clientToAnchorCoords(e.clientX, e.clientY);
      const tip = nodesRef.current[nodesRef.current.length - 1];
      // Preserve real pointer throw velocity for release momentum
      tip.prevX = tip.x;
      tip.prevY = tip.y;
      tip.x = local.x;
      tip.y = local.y;
      dragTargetRef.current = local;

      const restLen = segLenRef.current * (NODE_COUNT - 1);
      if (!toggledInDragRef.current && local.y - restLen >= PULL_DETENT_PX) {
        toggledInDragRef.current = true;
        toggleTheme();
      }
      ensureLoop();
    }

    function onWindowUp(e: PointerEvent) {
      if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) {
        return;
      }
      finishDrag(false);
    }

    function onWindowCancel(e: PointerEvent) {
      if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) {
        return;
      }
      finishDrag(true);
    }

    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowCancel);
    window.addEventListener("blur", onWindowCancel as unknown as EventListener);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowCancel);
      window.removeEventListener("blur", onWindowCancel as unknown as EventListener);
    };
  }, [dragging, clientToAnchorCoords, ensureLoop, finishDrag]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    draggingRef.current = true;
    dragPointerIdRef.current = e.pointerId;
    movedDuringDragRef.current = false;
    toggledInDragRef.current = false;
    startClientRef.current = { x: e.clientX, y: e.clientY };
    const local = clientToAnchorCoords(e.clientX, e.clientY);
    dragTargetRef.current = local;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Window listeners already handle pointer tracking
    }
    ensureLoop();
  }

  function handleHoverBrush(e: React.PointerEvent<HTMLButtonElement>) {
    if (draggingRef.current) return;
    const now = performance.now();
    const prev = lastHoverPointerRef.current;
    lastHoverPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
    if (!prev) {
      // Gentle initial brush wake when pointer first meets the rope
      applyImpulse((Math.random() > 0.5 ? 1 : -1) * 3.8, 0.8);
      return;
    }
    const dt = Math.max(8, now - prev.t);
    if (dt > 120) {
      applyImpulse(2.6, 0.4);
      return;
    }
    const vx = Math.max(-18, Math.min(18, ((e.clientX - prev.x) / dt) * 14));
    const vy = Math.max(-10, Math.min(10, ((e.clientY - prev.y) / dt) * 8));
    if (Math.hypot(vx, vy) > 0.9) {
      applyImpulse(vx, vy);
    }
  }

  function handleKeyOrSyntheticClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (suppressNextClickRef.current) {
      e.preventDefault();
      return;
    }
    toggleTheme();
    applyImpulse((Math.random() > 0.5 ? 1 : -1) * 6.0, 7.0);
  }

  const label = isDark ? "Pull cord to switch to light theme" : "Pull cord to switch to dark theme";
  const beadGradId = `rope-bead-${uid}`;
  const ferruleGradId = `rope-ferrule-${uid}`;

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid="theme-toggle"
      data-dragging={dragging ? "true" : "false"}
      data-swaying={swaying ? "true" : "false"}
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerEnter={handleHoverBrush}
      onPointerMove={handleHoverBrush}
      onPointerLeave={() => {
        lastHoverPointerRef.current = null;
      }}
      onClick={handleKeyOrSyntheticClick}
      className={`pull-rope-toggle ${isDark ? "is-dark" : ""} ${dragging ? "is-dragging" : ""} ${className}`}
    >
      {/* Mounted brass ceiling cap */}
      <span className="pull-rope__cap" aria-hidden="true" />

      {/* Free-swinging Verlet SVG cord & hanging acorn pull */}
      <svg
        ref={svgRef}
        className="pull-rope__svg"
        viewBox="-76 -6 152 146"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={ferruleGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6f4f2c" />
            <stop offset="50%" stopColor="#d4b17e" />
            <stop offset="100%" stopColor="#6f4f2c" />
          </linearGradient>
          <radialGradient id={beadGradId} cx="36%" cy="32%" r="68%">
            <stop offset="0%" stopColor={isDark ? "#fbe6b0" : "#ad7e52"} />
            <stop offset="58%" stopColor={isDark ? "#d69e49" : "#6b472b"} />
            <stop offset="100%" stopColor={isDark ? "#8b591e" : "#2e1d11"} />
          </radialGradient>
        </defs>

        <g style={{ pointerEvents: "auto" }}>
          {/* Wide invisible grab & brush capsule following the moving cord */}
          <path
            d={ropeState.pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={28}
            strokeLinecap="round"
          />

          {/* Soft ambient shadow behind cord */}
          <path
            d={ropeState.pathD}
            fill="none"
            stroke="rgba(0,0,0,0.22)"
            strokeWidth={3.6}
            strokeLinecap="round"
            transform="translate(1.5, 2.5)"
          />

          {/* Base braided cotton rope */}
          <path
            d={ropeState.pathD}
            fill="none"
            stroke={isDark ? "#cdb491" : "#8b6643"}
            strokeWidth={2.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Diagonal braided highlight strand */}
          <path
            d={ropeState.braidHighlightD}
            fill="none"
            stroke={isDark ? "rgba(255,244,224,0.45)" : "rgba(246,232,208,0.48)"}
            strokeWidth={1.6}
            strokeDasharray="2.5 3.2"
            strokeLinecap="round"
          />

          {/* Weighted Brass Ferrule + Acorn Pull + Silk Tassel rotated with rope tangent */}
          <g
            transform={`translate(${ropeState.tipX.toFixed(2)}, ${ropeState.tipY.toFixed(2)}) rotate(${ropeState.angleDeg.toFixed(2)}) scale(${(1 + ropeState.stretchRatio * 0.04).toFixed(3)})`}
          >
            {/* Dark-mode warm lantern halo */}
            {isDark && (
              <circle
                cx={0}
                cy={15}
                r={17}
                fill="rgba(239, 194, 109, 0.28)"
                filter="blur(5px)"
              />
            )}

            {/* Larger interactive knob hit circle */}
            <circle cx={0} cy={14} r={20} fill="transparent" />

            {/* Knotted cord loop & brass ferrule */}
            <rect
              x={-5}
              y={-1}
              width={10}
              height={6.5}
              rx={3}
              fill={`url(#${ferruleGradId})`}
            />

            {/* Tactile carved acorn pull */}
            <path
              d="M -7.5 5.5 C -9.2 5.5, -9.5 14, -7.2 20.5 C -5 25.5, 5 25.5, 7.2 20.5 C 9.5 14, 9.2 5.5, 7.5 5.5 Z"
              fill={`url(#${beadGradId})`}
              stroke={isDark ? "rgba(255,236,192,0.45)" : "rgba(46,29,17,0.32)"}
              strokeWidth={1}
            />

            {/* Specular highlight on acorn shoulder */}
            <ellipse
              cx={-2.8}
              cy={11.5}
              rx={1.8}
              ry={4.2}
              fill="rgba(255,255,255,0.28)"
              transform="rotate(-8 -2.8 11.5)"
            />

            {/* Finial silk tassel tip */}
            <path
              d="M -2.2 24.5 L 2.2 24.5 L 1.4 31.5 Q 0 32.8 -1.4 31.5 Z"
              fill={isDark ? "#b4833e" : "#5e3f27"}
              opacity={0.85}
            />
          </g>
        </g>
      </svg>

      <span className="pull-rope__tooltip" aria-hidden="true">
        {isDark ? "Pull Light" : "Pull Dark"}
      </span>
    </button>
  );
}
