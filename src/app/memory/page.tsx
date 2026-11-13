"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Images,
  MapPin,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { BookMotifPreview } from "@/components/BookMotifPreview";
import { ExpandableDock } from "@/components/ExpandableDock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { defaultBooks } from "@/lib/default-books";
import { getMemoryDisplayTitle } from "@/lib/memory-layout";
import {
  deleteMemory,
  fetchBooks,
  fetchMemory,
  isStorageAuthError,
  resolveMediaUrl,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum } from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.6deg", "-1.1deg", "0.7deg"];

function MemoryAlbumContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bookId = params.get("bookId") || "memories-2022";
  const memoryId = params.get("id") || "";

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [memory, setMemory] = useState<MemoryAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!memoryId) {
      setMemory(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [booksRes, memRes] = await Promise.all([
        fetchBooks(),
        fetchMemory(memoryId),
      ]);
      setBooks(booksRes.books);
      setMemory(memRes.memory);
    } catch (err) {
      if (isStorageAuthError(err)) return;
      throw err;
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useEffect(() => {
    void loadData();
    const handler = () => void loadData();
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [loadData]);

  useEffect(() => {
    if (lightboxIndex === null || !memory) return;
    const total = memory.photos.length;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? null : (i + 1) % total));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i === null ? null : (i - 1 + total) % total));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, memory]);

  const book = useMemo(
    () => books.find((b) => b.id === (memory?.bookId || bookId)) || books[0],
    [books, bookId, memory?.bookId],
  );

  async function handleDelete() {
    if (!memory) return;
    if (!window.confirm(`Delete "${memory.title}" from ${book.title}?`)) return;
    setDeleting(true);
    try {
      await deleteMemory(memory.id);
      router.push(`/book?id=${encodeURIComponent(book.id)}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="diary-page">
      <header className="diary-topbar">
        <Link
          href="/"
          className="wordmark"
          aria-label="My Diary — Return to Home Shelf"
          title="Go to Home Shelf"
        >
          <span>MY DIARY</span>
        </Link>

        <div className="header-controls-cluster">
          <ExpandableDock
            ariaLabel="Memory navigation"
            onStorageConnected={() => void loadData()}
          >
            <Link
              href={`/book?id=${encodeURIComponent(book.id)}`}
              className="top-dock__btn top-dock__btn--soft"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="max-w-[120px] truncate">{book.shortTitle}</span>
            </Link>

            <Link
              href={`/?book=${encodeURIComponent(book.id)}`}
              className="top-dock__btn"
            >
              <span>Shelf</span>
            </Link>

            {memory && (
              <>
                <span className="top-dock__divider" aria-hidden="true" />
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(memory.id)}`}
                  className="top-dock__btn"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit Album</span>
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="top-dock__btn top-dock__btn--danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{deleting ? "Removing..." : "Delete"}</span>
                </button>
              </>
            )}
          </ExpandableDock>

          <ThemeToggle />
        </div>
      </header>

      <main className="diary-container">
        {loading ? (
          <div
            className="stationery-card min-h-[440px] p-8 sm:p-12 flex flex-col justify-between"
            aria-busy="true"
            aria-label="Opening your memory album"
          >
            <div className="space-y-4">
              <div className="h-3 w-36 rounded-full bg-[var(--hairline)] animate-pulse" />
              <div className="h-10 w-3/4 max-w-md rounded bg-[var(--hairline)] animate-pulse" />
              <div className="h-4 w-56 rounded bg-[var(--hairline)] animate-pulse opacity-70" />
            </div>
            <div className="my-8 space-y-3">
              <div className="h-3.5 w-full rounded bg-[var(--hairline)] animate-pulse opacity-65" />
              <div className="h-3.5 w-11/12 rounded bg-[var(--hairline)] animate-pulse opacity-65" />
              <div className="h-3.5 w-4/5 rounded bg-[var(--hairline)] animate-pulse opacity-65" />
            </div>
            <p className="text-xs tracking-[0.16em] uppercase text-[var(--ink-soft)]">
              Opening your memory album...
            </p>
          </div>
        ) : !memory ? (
          <div className="stationery-card p-12 text-center">
            <h1
              className="m-0 text-3xl font-normal"
              style={{ fontFamily: "var(--serif)" }}
            >
              Memory Album Not Found
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              This memory may belong to another storage server or was removed.
            </p>
            <Link
              href={`/book?id=${encodeURIComponent(book.id)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline"
            >
              Return to {book.shortTitle}
            </Link>
          </div>
        ) : (
          <article className="stationery-card relative overflow-hidden">
            <div
              className="h-2 w-full"
              style={{
                background: `linear-gradient(90deg, ${book.cover} 0%, ${book.accent} 50%, ${book.cover} 100%)`,
              }}
            />

            {(() => {
              const hasWords = Boolean(
                memory.title?.trim() ||
                  memory.note?.trim() ||
                  memory.paragraphs.length > 0,
              );
              const hasPhotos = memory.photos.length > 0;
              const bothCols = hasWords && hasPhotos;
              return (
                <div className={bothCols ? "grid lg:grid-cols-12" : "grid grid-cols-1"}>
                  {hasWords && (
                    <div
                      className={`p-6 sm:p-10 ${
                        bothCols
                          ? "border-b border-[var(--hairline)] lg:col-span-6 lg:border-r lg:border-b-0 lg:shadow-[inset_-18px_0_24px_-24px_rgba(37,35,31,0.35)]"
                          : "mx-auto w-full max-w-2xl"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <BookMotifPreview book={book} size="sm" />
                        <div>
                          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                            {book.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)]">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {memory.date}
                            </span>
                            {memory.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {memory.location}
                              </span>
                            )}
                            <span className="rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)]">
                              {memory.mood}
                            </span>
                          </div>
                        </div>
                      </div>

                      {memory.title?.trim() && (
                        <h1
                          className="mt-7 mb-0 text-4xl sm:text-5xl font-normal tracking-tight leading-[1.02]"
                          style={{ fontFamily: "var(--serif)" }}
                        >
                          {memory.title}
                        </h1>
                      )}

                      {memory.note && (
                        <div className="note-slip mt-8">
                          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--accent)]">
                            <StickyNote className="h-3 w-3" />
                            <span>Keepsake Note</span>
                          </div>
                          <p
                            className="m-0 text-base sm:text-lg italic leading-relaxed text-[var(--page-ink)]"
                            style={{ fontFamily: "var(--serif)" }}
                          >
                            “{memory.note}”
                          </p>
                        </div>
                      )}

                      {memory.paragraphs.length > 0 && (
                        <div className="diary-prose mt-8">
                          {memory.paragraphs.map((paragraph, idx) => (
                            <p key={idx}>{paragraph}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {hasPhotos && (
                    <div
                      className={`bg-[var(--page-bg)] p-6 sm:p-10 ${
                        bothCols ? "lg:col-span-6" : ""
                      }`}
                    >
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3">
                        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                          <Images className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span>
                            Memory Photo Album · {memory.photos.length}{" "}
                            {memory.photos.length === 1 ? "Frame" : "Frames"}
                            {!hasWords ? ` · ${memory.date}` : ""}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
                          {memory.albumStyle === "portrait"
                            ? "Wedding Album"
                            : memory.albumStyle === "filmstrip"
                              ? "Contact Sheet"
                              : memory.albumStyle === "grid"
                                ? "Editorial Grid"
                                : "Archival Polaroids"}
                        </span>
                      </div>

                      {memory.albumStyle === "filmstrip" ? (
                  <div className="space-y-4">
                    {memory.photos.map((photo, idx) => (
                      <div key={photo.id} className="filmstrip-frame">
                        <div className="filmstrip-sprockets" aria-hidden="true">
                          {Array.from({ length: 12 }).map((_, s) => (
                            <span key={s} />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="my-2 block w-full overflow-hidden bg-black cursor-pointer"
                        >
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt={photo.caption || `Album frame ${idx + 1}`}
                            className="max-h-80 w-full object-contain transition duration-300 hover:scale-[1.02]"
                          />
                        </button>
                        <div className="filmstrip-sprockets" aria-hidden="true">
                          {Array.from({ length: 12 }).map((_, s) => (
                            <span key={s} />
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#dfd7c7]">
                          <span className="font-mono text-[10px] tracking-widest uppercase text-[#b5aa97]">
                            FRAME {String(idx + 1).padStart(2, "0")}A
                          </span>
                          <span className="font-serif italic">
                            {photo.caption || photo.originalName}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : memory.albumStyle === "grid" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {memory.photos.map((photo, idx) => (
                      <figure
                        key={photo.id}
                        className={`m-0 border border-[var(--hairline)] bg-[var(--paper-light)] p-2.5 ${
                          idx === 0 && memory.photos.length % 2 === 1
                            ? "sm:col-span-2"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                        >
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt={photo.caption || `Album photo ${idx + 1}`}
                            className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]"
                          />
                        </button>
                        {(photo.caption || memory.photos.length > 1) && (
                          <figcaption className="mt-2 flex items-baseline justify-between gap-2 px-1 text-xs">
                            <span className="font-serif italic text-[var(--page-ink-muted)]">
                              {photo.caption || "Untitled frame"}
                            </span>
                            <span className="text-[10px] text-[var(--ink-soft)]">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                ) : memory.albumStyle === "portrait" || memory.photos.length === 1 ? (
                  memory.photos.length === 1 ? (
                    <div className="flex flex-col items-center justify-center py-4">
                      <figure className="m-0 w-full max-w-lg mx-auto flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(0)}
                          className="group relative block w-full overflow-hidden rounded-2xl shadow-2xl transition duration-500 hover:scale-[1.015] cursor-pointer bg-[var(--paper-deep)]"
                        >
                          <img
                            src={resolveMediaUrl(memory.photos[0].url)}
                            alt={memory.photos[0].caption || "Wedding Portrait"}
                            className="aspect-[3/4] sm:aspect-[4/5] max-h-[70vh] w-full object-cover transition duration-500 group-hover:brightness-105"
                          />
                        </button>
                        {memory.photos[0].caption && (
                          <figcaption className="mt-3 px-2 text-center font-serif text-sm italic tracking-wider text-[var(--page-ink-muted)]">
                            {memory.photos[0].caption}
                          </figcaption>
                        )}
                      </figure>
                    </div>
                  ) : (
                    <div className="space-y-4 py-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {memory.photos.slice(0, 2).map((photo, idx) => (
                          <figure key={photo.id} className="m-0">
                            <button
                              type="button"
                              onClick={() => setLightboxIndex(idx)}
                              className="group relative block w-full overflow-hidden rounded-xl shadow-lg transition duration-500 hover:scale-[1.02] cursor-pointer bg-[var(--paper-deep)]"
                            >
                              <img
                                src={resolveMediaUrl(photo.url)}
                                alt={photo.caption || `Photo ${idx + 1}`}
                                className="aspect-[4/3] w-full object-cover"
                              />
                            </button>
                          </figure>
                        ))}
                      </div>
                      {memory.photos.length > 2 && (
                        <div className={`grid gap-3 ${memory.photos.length - 2 === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                          {memory.photos.slice(2).map((photo, sliceIdx) => {
                            const idx = sliceIdx + 2;
                            return (
                              <figure key={photo.id} className="m-0">
                                <button
                                  type="button"
                                  onClick={() => setLightboxIndex(idx)}
                                  className="group relative block w-full overflow-hidden rounded-xl shadow-md transition duration-500 hover:scale-[1.02] cursor-pointer bg-[var(--paper-deep)]"
                                >
                                  <img
                                    src={resolveMediaUrl(photo.url)}
                                    alt={photo.caption || `Photo ${idx + 1}`}
                                    className="aspect-[3/4] sm:aspect-[2/3] w-full object-cover"
                                  />
                                </button>
                              </figure>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2">
                    {memory.photos.map((photo, idx) => (
                      <figure
                        key={photo.id}
                        className="polaroid-frame m-0"
                        style={{
                          transform: `rotate(${POLAROID_TILTS[idx % POLAROID_TILTS.length]})`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                        >
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt={photo.caption || `Polaroid ${idx + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                        </button>
                        <figcaption className="mt-3 px-1 text-center font-serif text-sm italic text-[var(--page-ink-muted)]">
                          {photo.caption || `${memory.date} · Frame ${idx + 1}`}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                    </div>
                  )}
                </div>
              );
            })()}
          </article>
        )}
      </main>

      {memory && lightboxIndex !== null && memory.photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#1b1916]/95 p-4 sm:p-8 text-[#f6f1e7]"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIndex(null);
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs tracking-widest uppercase text-[#bfb6a6]">
              {getMemoryDisplayTitle(memory)} · {String(lightboxIndex + 1).padStart(2, "0")} /{" "}
              {String(memory.photos.length).padStart(2, "0")}
            </div>
            <div className="flex items-center gap-3">
              <a
                href={resolveMediaUrl(memory.photos[lightboxIndex].url)}
                download={memory.photos[lightboxIndex].originalName || "memory.jpg"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-white/20 px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase no-underline hover:bg-white/10"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Original</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Close lightbox"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden py-4">
            {memory.photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex(
                    (lightboxIndex - 1 + memory.photos.length) %
                      memory.photos.length,
                  )
                }
                aria-label="Previous photo"
                className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/40 hover:bg-black/70 cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <img
              src={resolveMediaUrl(memory.photos[lightboxIndex].url)}
              alt={memory.photos[lightboxIndex].caption || getMemoryDisplayTitle(memory)}
              className="max-h-[75dvh] max-w-full object-contain shadow-2xl"
            />

            {memory.photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((lightboxIndex + 1) % memory.photos.length)
                }
                aria-label="Next photo"
                className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/40 hover:bg-black/70 cursor-pointer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          <p className="m-0 text-center font-serif text-lg italic text-[#e8dfd0]">
            {memory.photos[lightboxIndex].caption ||
              memory.photos[lightboxIndex].originalName}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MemoryAlbumPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--paper)]" />}>
      <MemoryAlbumContent />
    </Suspense>
  );
}

