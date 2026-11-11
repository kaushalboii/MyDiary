"use client";

import { resolveMediaUrl } from "@/lib/storage-client";
import type { DiaryBook } from "@/lib/types";

export function BookMotifPreview({
  book,
  size = "md",
}: {
  book: DiaryBook;
  size?: "sm" | "md" | "lg";
}) {
  const heightRatio = Math.min(1.18, Math.max(0.8, (book.height || 2.12) / 2.12));
  const widthRatio = Math.min(1.18, Math.max(0.8, (book.width || 1.3) / 1.3));
  const baseDims =
    size === "sm"
      ? { w: 48, h: 68, titleSize: "7px", pad: "6px" }
      : size === "lg"
        ? { w: 148, h: 206, titleSize: "15px", pad: "14px" }
        : { w: 84, h: 118, titleSize: "10px", pad: "9px" };

  const w = Math.round(baseDims.w * widthRatio);
  const h = Math.round(baseDims.h * heightRatio);
  const template = book.coverTemplate || (book.coverImage ? "photo-card" : "classic");
  const coverSrc = book.coverImage ? resolveMediaUrl(book.coverImage) : "";
  const showOverlayText = template !== "photo-card" || (book.showCoverTextWithImage ?? true);

  return (
    <div
      className="relative shrink-0 overflow-hidden select-none transition-all duration-200"
      style={{
        width: w,
        height: h,
        backgroundColor: book.cover,
        color: book.ink,
        borderRadius: "2px 5px 5px 2px",
        boxShadow:
          "inset 6px 0 10px rgba(0,0,0,0.22), 4px 10px 22px -12px rgba(37,35,31,0.55)",
        border: "1px solid rgba(37, 35, 31, 0.16)",
        padding: baseDims.pad,
      }}
      aria-hidden="true"
    >
      {/* Full-bleed Photo Cover when selected */}
      {template === "photo-card" && coverSrc && (
        <img
          src={coverSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {template === "photo-card" && coverSrc && showOverlayText && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,17,14,0.68) 0%, rgba(20,17,14,0.06) 55%, rgba(20,17,14,0.56) 100%)",
          }}
        />
      )}

      {/* Split Band template */}
      {template === "split-band" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "40%",
            backgroundColor: book.accent,
            borderTop: `1px solid ${book.ink}`,
          }}
        />
      )}

      {/* Framed Plaque template */}
      {template === "bordered-plaque" && (
        <div
          style={{
            position: "absolute",
            left: size === "sm" ? 7 : 11,
            right: size === "sm" ? 7 : 11,
            top: "22%",
            height: coverSrc ? "34%" : "44%",
            backgroundColor: "#f4efe3",
            border: `1.5px solid ${book.accent}`,
            borderRadius: 2,
          }}
        />
      )}

      {/* Cloth spine crease */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 5,
          width: 1,
          backgroundColor: book.accent,
          opacity: book.spineStyle === "minimal" ? 0.2 : 0.72,
        }}
      />

      {/* Foil inset frame for classic & minimal */}
      {(template === "classic" || template === "clean-minimal") && (
        <div
          style={{
            position: "absolute",
            inset: size === "sm" ? 4 : 7,
            border: `1px solid ${template === "clean-minimal" ? book.accent : book.ink}`,
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Classic Abstract Foil Motif SVG */}
      {template === "classic" && (
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
      )}

      {/* Inset image vignette for non-photo-card templates */}
      {template !== "photo-card" && coverSrc && (
        <div
          className="overflow-hidden rounded-[2px] border"
          style={{
            position: "absolute",
            left: size === "sm" ? 10 : 16,
            right: size === "sm" ? 8 : 14,
            bottom: size === "sm" ? 8 : 16,
            height: "36%",
            borderColor: book.accent,
          }}
        >
          <img src={coverSrc} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {showOverlayText && (
        <div
          className={`relative z-10 flex h-full flex-col justify-between ${
            template === "clean-minimal" || template === "bordered-plaque"
              ? "items-center text-center"
              : "pl-1.5"
          }`}
          style={{
            color: template === "bordered-plaque" ? "#25231f" : book.ink,
          }}
        >
          <div style={{ marginTop: template === "bordered-plaque" ? "18%" : 0 }}>
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
                fontSize: baseDims.titleSize,
                lineHeight: 1.05,
                marginTop: 3,
                fontWeight: 500,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}
            >
              {book.title || book.shortTitle}
            </div>
          </div>

          {size !== "sm" && template !== "split-band" && template !== "bordered-plaque" && (
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
      )}
    </div>
  );
}
