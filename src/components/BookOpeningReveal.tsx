"use client";

import type { DiaryBook } from "@/lib/types";

export function BookOpeningReveal({
  book,
  statusLabel,
}: {
  book: DiaryBook;
  statusLabel?: string;
}) {
  const secondary = book.secondary || "#e7dfd1";
  const accent = book.accent || "#c06445";
  const paperStyle = book.paperStyle || "cream";

  const pageLinesStyle =
    paperStyle === "lined"
      ? {
          backgroundImage:
            "repeating-linear-gradient(180deg, transparent 0 21px, var(--page-line) 21px 22px)",
        }
      : paperStyle === "dotgrid"
        ? {
            backgroundImage:
              "radial-gradient(var(--page-dot) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }
        : undefined;

  return (
    <div
      className="book-reveal-stage"
      data-testid="book-opening-reveal"
      role="status"
      aria-live="polite"
      aria-label={statusLabel || `Opening ${book.title}`}
    >
      <div className="book-reveal-scene">
        <div className="book-reveal-shadow" aria-hidden="true" />

        <div className="book-reveal-book">
          {/* Revealed stationery page inside the opened cover */}
          <div className="book-reveal-page" style={pageLinesStyle}>
            {paperStyle === "framed" && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 rounded-[4px] border border-[var(--hairline)]"
              />
            )}
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--ink-soft)]">
                <span>{book.coverImprint || "ARCHIVE"}</span>
                <span>{book.spineMark || "01"}</span>
              </div>

              <div className="my-auto py-3">
                <span
                  className="mb-2.5 block h-0.5 w-8 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <div
                  className="text-lg sm:text-xl font-normal leading-tight text-[var(--page-ink)]"
                  style={{ fontFamily: "var(--serif)" }}
                >
                  {book.title}
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--page-ink-muted)]">
                  {book.welcomeNote?.trim() ||
                    "Turning open quiet archival pages..."}
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] italic text-[var(--ink-soft)]">
                <span>p. 01</span>
                <span>{book.yearLabel}</span>
              </div>
            </div>
          </div>

          {/* Translucent turning inner parchment leaf */}
          <div className="book-reveal-leaf" aria-hidden="true" />

          {/* Hinged hardcover swinging open left-to-right-open */}
          <div
            className="book-reveal-cover"
            aria-hidden="true"
            style={{
              backgroundColor: book.cover,
              color: book.ink,
            }}
          >
            {/* Outer cover face */}
            <div className="book-reveal-cover__front">
              <span
                className="book-reveal-cover__spine"
                style={{ backgroundColor: accent }}
              />
              <div
                className="book-reveal-cover__band"
                style={{ backgroundColor: secondary }}
              />
              <div className="book-reveal-cover__copy">
                <span className="book-reveal-cover__eyebrow">
                  {book.yearLabel || "Diary"}
                </span>
                <span className="book-reveal-cover__title">
                  {book.shortTitle || book.title}
                </span>
              </div>
            </div>

            {/* Inner endpaper visible as cover opens wide */}
            <div
              className="book-reveal-cover__inside"
              style={{ backgroundColor: secondary }}
            />
          </div>
        </div>
      </div>

      <p className="mt-5 font-serif text-sm italic text-[var(--ink-soft)]">
        {statusLabel || `Opening ${book.title}...`}
      </p>
    </div>
  );
}

