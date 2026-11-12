"use client";

import { resolveMediaUrl } from "@/lib/storage-client";
import type { CoverTemplate, DiaryBook } from "@/lib/types";

function isLightHex(hex: string): boolean {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52;
}

const CENTERED_TEMPLATES = new Set<CoverTemplate>([
  "clean-minimal",
  "bordered-plaque",
  "arch-frame",
  "top-header-band",
  "sun-disc",
  "horizon-rule",
  "double-inset",
  "oval-medallion",
  "window-pane",
  "botanical-stem",
  "stepped-plinth",
]);

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
  const template: CoverTemplate =
    book.coverTemplate || (book.coverImage ? "photo-card" : "classic");
  const secondary = book.secondary || book.accent;
  const plaqueBg = book.secondary || "#faf7f0";
  const coverSrc = book.coverImage ? resolveMediaUrl(book.coverImage) : "";
  const showOverlayText =
    template !== "photo-card" || (book.showCoverTextWithImage ?? true);
  const centered = CENTERED_TEMPLATES.has(template);
  const contrastSecondaryInk = isLightHex(plaqueBg) ? "#1e1b17" : "#f9f6ef";

  const textColor =
    template === "bordered-plaque" ||
    template === "top-header-band" ||
    template === "oval-medallion"
      ? contrastSecondaryInk
      : book.ink;

  return (
    <div
      className="relative shrink-0 overflow-hidden select-none transition-all duration-200"
      style={{
        width: w,
        height: h,
        backgroundColor: book.cover,
        color: book.ink,
        borderRadius: "4px 8px 8px 4px",
        boxShadow:
          "inset 6px 0 12px rgba(0,0,0,0.12), 4px 10px 22px -14px rgba(51,46,41,0.34)",
        border: "1px solid rgba(51, 46, 41, 0.14)",
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

      {/* Template Artwork Layers */}
      {template === "split-band" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "42%",
            backgroundColor: secondary,
            borderTop: `2px solid ${book.accent}`,
          }}
        />
      )}

      {template === "side-spine-band" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "14%",
            backgroundColor: secondary,
            borderRight: `1.5px solid ${book.accent}`,
          }}
        />
      )}

      {template === "top-header-band" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "42%",
            backgroundColor: secondary,
            borderBottom: `2px solid ${book.accent}`,
          }}
        />
      )}

      {template === "bordered-plaque" && (
        <div
          style={{
            position: "absolute",
            left: size === "sm" ? 7 : 11,
            right: size === "sm" ? 7 : 11,
            top: "22%",
            height: coverSrc ? "34%" : "44%",
            backgroundColor: plaqueBg,
            border: `1.5px solid ${book.accent}`,
            borderRadius: 5,
          }}
        />
      )}

      {template === "oval-medallion" && (
        <div
          style={{
            position: "absolute",
            left: "18%",
            right: "18%",
            top: "18%",
            bottom: coverSrc ? "42%" : "24%",
            backgroundColor: secondary,
            border: `1.5px solid ${book.accent}`,
            borderRadius: "999px",
          }}
        />
      )}

      {template === "arch-frame" && (
        <div
          style={{
            position: "absolute",
            left: "21%",
            right: "21%",
            bottom: size === "sm" ? 7 : 12,
            height: "44%",
            backgroundColor: secondary,
            border: `1.2px solid ${book.accent}`,
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
          }}
        />
      )}

      {template === "sun-disc" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: size === "sm" ? 8 : 14,
            width: size === "sm" ? 20 : size === "lg" ? 64 : 36,
            height: size === "sm" ? 20 : size === "lg" ? 64 : 36,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            backgroundColor: secondary,
            boxShadow: `0 0 0 1.5px ${book.accent}`,
          }}
        />
      )}

      {template === "horizon-rule" && (
        <div
          className="flex flex-col items-center gap-1"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "22%",
          }}
        >
          <span style={{ width: "52%", height: 3, backgroundColor: secondary, borderRadius: 2 }} />
          <span style={{ width: "36%", height: 1.5, backgroundColor: book.accent }} />
          <span style={{ width: "20%", height: 2, backgroundColor: secondary, borderRadius: 2 }} />
        </div>
      )}

      {template === "double-inset" && (
        <>
          <div
            style={{
              position: "absolute",
              inset: size === "sm" ? 3 : 6,
              border: `1.5px solid ${secondary}`,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: size === "sm" ? 5 : 9,
              border: `1px solid ${book.accent}`,
              opacity: 0.7,
            }}
          />
        </>
      )}

      {template === "corner-brackets" && (
        <svg
          viewBox="0 0 100 130"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect x="12" y="64" width="76" height="38" fill={secondary} opacity="0.55" />
          <g stroke={book.accent} strokeWidth="2" fill="none">
            <path d="M8 22 V8 H22" />
            <path d="M78 8 H92 V22" />
            <path d="M8 108 V122 H22" />
            <path d="M78 122 H92 V108" />
          </g>
        </svg>
      )}

      {template === "window-pane" && (
        <div
          className="grid grid-cols-2 gap-1 p-1"
          style={{
            position: "absolute",
            left: "21%",
            right: "21%",
            bottom: size === "sm" ? 8 : 14,
            height: "39%",
            border: `1px solid ${book.accent}`,
            borderRadius: 3,
          }}
        >
          <span style={{ backgroundColor: secondary, borderRadius: 1 }} />
          <span style={{ backgroundColor: secondary, borderRadius: 1 }} />
          <span style={{ backgroundColor: secondary, borderRadius: 1 }} />
          <span style={{ backgroundColor: secondary, borderRadius: 1 }} />
        </div>
      )}

      {template === "quarter-block" && (
        <>
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: "58%",
              height: "46%",
              backgroundColor: secondary,
              borderLeft: `1.5px solid ${book.accent}`,
              borderTop: `1.5px solid ${book.accent}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "54%",
              width: "42%",
              height: 1.5,
              backgroundColor: book.accent,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "42%",
              top: 0,
              height: "54%",
              width: 1.5,
              backgroundColor: book.accent,
            }}
          />
        </>
      )}

      {template === "bookmark-ribbon" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: size === "sm" ? 6 : 12,
            width: size === "sm" ? 6 : 10,
            height: "68%",
            backgroundColor: secondary,
            borderLeft: `1.5px solid ${book.accent}`,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)",
          }}
        />
      )}

      {template === "diagonal-sash" && (
        <svg
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <polygon points="18,140 100,72 100,140" fill={secondary} />
          <line x1="18" y1="140" x2="100" y2="72" stroke={book.accent} strokeWidth="2.2" />
        </svg>
      )}

      {template === "botanical-stem" && (
        <svg
          viewBox="0 0 100 130"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <ellipse cx="50" cy="84" rx="20" ry="26" fill={secondary} />
          <path d="M50 104 Q 48 82, 50 62" stroke={book.accent} strokeWidth="2" fill="none" />
          <ellipse cx="42" cy="86" rx="7" ry="3.5" transform="rotate(-24 42 86)" fill={book.accent} opacity="0.8" />
          <ellipse cx="58" cy="76" rx="7" ry="3.5" transform="rotate(24 58 76)" fill={book.accent} opacity="0.8" />
        </svg>
      )}

      {template === "catalog-ticket" && (
        <div
          style={{
            position: "absolute",
            left: "14%",
            right: "14%",
            bottom: size === "sm" ? 8 : 14,
            height: "32%",
            backgroundColor: secondary,
            borderRadius: 3,
            borderTop: `2px solid ${book.accent}`,
          }}
        />
      )}

      {template === "stepped-plinth" && (
        <>
          <div
            style={{
              position: "absolute",
              left: "24%",
              right: "24%",
              bottom: 0,
              height: "28%",
              backgroundColor: secondary,
              opacity: 0.72,
              borderTop: `1.5px solid ${book.accent}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "12%",
              right: "12%",
              bottom: 0,
              height: "19%",
              backgroundColor: secondary,
              opacity: 0.86,
              borderTop: `1.5px solid ${book.accent}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "11%",
              backgroundColor: secondary,
              borderTop: `1.5px solid ${book.accent}`,
            }}
          />
        </>
      )}

      {/* Cloth spine crease */}
      {template !== "side-spine-band" && (
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
      )}

      {/* Foil inset frame for classic & minimal */}
      {(template === "classic" || template === "clean-minimal") && (
        <div
          style={{
            position: "absolute",
            inset: size === "sm" ? 4 : 7,
            border: `1px solid ${template === "clean-minimal" ? book.accent : book.ink}`,
            opacity: 0.28,
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
            opacity: 0.34,
            pointerEvents: "none",
          }}
        >
          <g stroke={book.accent} strokeWidth="1.5" fill="none">
            <circle cx="52" cy="64" r="12" />
            <circle cx="52" cy="64" r="22" />
            <circle cx="52" cy="64" r="30" />
          </g>
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
            centered
              ? "items-center text-center"
              : template === "side-spine-band"
                ? "pl-3"
                : "pl-1.5"
          }`}
          style={{ color: textColor }}
        >
          <div
            style={{
              marginTop:
                template === "bordered-plaque" || template === "oval-medallion"
                  ? "22%"
                  : template === "double-inset"
                    ? "10%"
                    : 0,
            }}
          >
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

          {size !== "sm" &&
            template !== "split-band" &&
            template !== "bordered-plaque" &&
            template !== "oval-medallion" &&
            template !== "catalog-ticket" &&
            template !== "stepped-plinth" && (
              <div
                style={{
                  fontSize: size === "lg" ? "8px" : "6px",
                  opacity: 0.8,
                  borderTop: `1px solid ${book.accent}`,
                  paddingTop: 4,
                  color: book.ink,
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
