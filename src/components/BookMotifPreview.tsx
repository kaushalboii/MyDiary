"use client";

import type { DiaryBook } from "@/lib/types";

export function BookMotifPreview({
  book,
  size = "md",
}: {
  book: DiaryBook;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm"
      ? { w: 48, h: 68, titleSize: "7px", pad: "6px" }
      : size === "lg"
        ? { w: 148, h: 206, titleSize: "15px", pad: "14px" }
        : { w: 84, h: 118, titleSize: "10px", pad: "9px" };

  return (
    <div
      className="relative shrink-0 overflow-hidden select-none"
      style={{
        width: dims.w,
        height: dims.h,
        backgroundColor: book.cover,
        color: book.ink,
        borderRadius: "2px 5px 5px 2px",
        boxShadow:
          "inset 6px 0 10px rgba(0,0,0,0.22), 4px 10px 22px -12px rgba(37,35,31,0.55)",
        border: "1px solid rgba(37, 35, 31, 0.16)",
        padding: dims.pad,
      }}
      aria-hidden="true"
    >
      {/* Cloth spine crease */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 5,
          width: 1,
          backgroundColor: book.accent,
          opacity: 0.72,
        }}
      />
      {/* Foil inset frame */}
      <div
        style={{
          position: "absolute",
          inset: size === "sm" ? 4 : 7,
          border: `1px solid ${book.ink}`,
          opacity: 0.25,
          pointerEvents: "none",
        }}
      />
      {/* Abstract Foil Motif SVG */}
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.42,
          pointerEvents: "none",
        }}
      >
        {book.motif === "lattice" && (
          <g stroke={book.accent} strokeWidth="1.5" fill={book.accent}>
            <line x1="22" y1="45" x2="78" y2="80" />
            <line x1="78" y1="45" x2="25" y2="82" />
            <line x1="48" y1="38" x2="55" y2="88" />
            <circle cx="22" cy="45" r="2.6" />
            <circle cx="78" cy="45" r="2.6" />
            <circle cx="52" cy="64" r="3.4" />
            <circle cx="25" cy="82" r="2.4" />
            <circle cx="78" cy="80" r="2.4" />
          </g>
        )}
        {book.motif === "boom" || book.motif === "orbit" || book.motif === "gather" ? (
          <g stroke={book.accent} strokeWidth="1.5" fill="none">
            <circle cx="52" cy="64" r="12" />
            <circle cx="52" cy="64" r="22" />
            <circle cx="52" cy="64" r="32" />
          </g>
        ) : book.motif === "wave" || book.motif === "continuum" ? (
          <g stroke={book.accent} strokeWidth="2" fill="none">
            <path d="M12 58 Q 35 42, 55 58 T 90 58" />
            <path d="M12 72 Q 35 56, 55 72 T 90 72" />
            <path d="M12 85 Q 35 69, 55 85 T 90 85" />
          </g>
        ) : (
          <g stroke={book.accent} strokeWidth="1.4" fill="none">
            <rect x="20" y="46" width="60" height="40" />
            <line x1="20" y1="66" x2="80" y2="66" />
            <line x1="50" y1="46" x2="50" y2="86" />
            <circle cx="50" cy="66" r="6" fill={book.accent} />
          </g>
        )}
      </svg>

      <div className="relative z-10 flex h-full flex-col justify-between pl-1.5">
        <div>
          <div
            style={{
              fontSize: size === "lg" ? "7px" : "5px",
              letterSpacing: "0.18em",
              opacity: 0.75,
              textTransform: "uppercase",
            }}
          >
            {book.yearLabel}
          </div>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: dims.titleSize,
              lineHeight: 1.05,
              marginTop: 3,
              fontWeight: 500,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {book.shortTitle}
          </div>
        </div>

        {size !== "sm" && (
          <div
            style={{
              fontSize: size === "lg" ? "8px" : "6px",
              opacity: 0.8,
              borderTop: `1px solid ${book.accent}`,
              paddingTop: 4,
            }}
          >
            {book.memoryCount ?? 0}{" "}
            {(book.memoryCount ?? 0) === 1 ? "memory" : "memories"}
          </div>
        )}
      </div>
    </div>
  );
}
