"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Images,
  MapPin,
  PenLine,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { BookMotifPreview } from "@/components/BookMotifPreview";
import { VolumeEditorModal } from "@/components/VolumeEditorModal";
import { defaultBooks } from "@/lib/default-books";
import {
  deleteMemory,
  fetchBooks,
  fetchMemories,
  resolveMediaUrl,
  updateBook,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum } from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.5deg", "-1.1deg", "0.7deg"];

function BookMemoriesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bookId = params.get("id") || "memories-2022";
  const requestedMemoryId = params.get("memory") || "";

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [memories, setMemories] = useState<MemoryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editingVolume, setEditingVolume] = useState(false);
  const [activeMemoryId, setActiveMemoryId] = useState<string>(requestedMemoryId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [booksRes, memRes] = await Promise.all([
        fetchBooks(),
        fetchMemories({ bookId }),
      ]);
      setBooks(booksRes.books);
      setMemories(memRes.memories);
      setActiveMemoryId((prev) => {
        if (requestedMemoryId && memRes.memories.some((m) => m.id === requestedMemoryId)) {
          return requestedMemoryId;
        }
        if (prev && memRes.memories.some((m) => m.id === prev)) {
          return prev;
        }
        return memRes.memories[0]?.id || "";
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, requestedMemoryId]);

  useEffect(() => {
    void loadData();
    const handler = () => void loadData();
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [loadData]);

  useEffect(() => {
    setLightboxIndex(null);
  }, [activeMemoryId, bookId]);

  const book = useMemo(
    () => books.find((b) => b.id === bookId) || books[0],
    [books, bookId],
  );

  const currentIndex = useMemo(() => {
    if (!memories.length) return -1;
    const idx = memories.findIndex((m) => m.id === activeMemoryId);
    return idx >= 0 ? idx : 0;
  }, [memories, activeMemoryId]);

  const currentMemory = currentIndex >= 0 ? memories[currentIndex] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (lightboxIndex !== null && currentMemory) {
        const total = currentMemory.photos.length;
        if (e.key === "Escape") setLightboxIndex(null);
        if (e.key === "ArrowRight")
          setLightboxIndex((i) => (i === null ? null : (i + 1) % total));
        if (e.key === "ArrowLeft")
          setLightboxIndex((i) => (i === null ? null : (i - 1 + total) % total));
        return;
      }

      if (memories.length > 1) {
        if (e.key === "ArrowRight" && currentIndex < memories.length - 1) {
          setActiveMemoryId(memories[currentIndex + 1].id);
        } else if (e.key === "ArrowLeft" && currentIndex > 0) {
          setActiveMemoryId(memories[currentIndex - 1].id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, currentMemory, memories, currentIndex]);

  async function handleSaveBook(patch: Partial<DiaryBook>) {
    const { book: updated } = await updateBook(book.id, patch);
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  async function handleDeleteMemory() {
    if (!currentMemory) return;
    if (!window.confirm(`Remove "${currentMemory.title}" from ${book.title}?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteMemory(currentMemory.id);
      await loadData();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="diary-page">
      <header className="diary-topbar">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/?book=${encodeURIComponent(book.id)}`}
            className="header-pill-btn"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Shelf</span>
          </Link>

          <select
            aria-label="Switch book"
            value={book.id}
            onChange={(e) =>
              router.push(`/book?id=${encodeURIComponent(e.target.value)}`)
            }
            className="hidden sm:block border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-xs font-medium"
          >
            {books.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {(item.memoryCount ?? 0) > 0 ? ` (${item.memoryCount})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingVolume(true)}
            className="header-pill-btn cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Customize Book</span>
          </button>

          <Link
            href={`/compose?bookId=${encodeURIComponent(book.id)}`}
            className="header-pill-btn header-pill-btn--primary"
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>Write Memory</span>
          </Link>
        </div>
      </header>

      <main className="diary-container">
        {loading ? (
          <div className="stationery-card p-16 text-center font-serif text-lg italic text-[var(--ink-soft)]">
            Opening {book.title}...
          </div>
        ) : (
          /* Physical Clothbound Hardcover Frame */
          <div
            className="relative rounded-[8px] p-2.5 sm:p-4 shadow-[0_28px_60px_-28px_rgba(37,35,31,0.52)]"
            style={{ backgroundColor: book.cover }}
          >
            {/* Bookmark Ribbon */}
            <div
              className="pointer-events-none absolute top-0 right-10 z-20 hidden sm:block h-9 w-3.5 shadow-sm"
              style={{
                backgroundColor: book.accent,
                clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)",
              }}
              aria-hidden="true"
            />

            <article className="stationery-card relative overflow-hidden">
              {/* Chapter Index Strip inside top margin when book has multiple memories */}
              {memories.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] bg-[#f4efe4] px-5 py-2.5 sm:px-8">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {memories.map((item, idx) => {
                      const active = item.id === currentMemory?.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveMemoryId(item.id)}
                          className={`px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                            active
                              ? "bg-[var(--ink)] text-[var(--paper-light)]"
                              : "border border-[var(--hairline)] bg-[var(--paper-light)] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                          }`}
                        >
                          <span className="mr-1 opacity-70">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          <span className="font-serif">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
                    Page {currentIndex + 1} of {memories.length}
                  </span>
                </div>
              )}

              {!currentMemory ? (
                /* Empty Book Open Title Spread */
                <div className="grid min-h-[540px] lg:grid-cols-12">
                  <div className="flex flex-col justify-between border-b border-[var(--hairline)] p-8 sm:p-12 lg:col-span-6 lg:border-r lg:border-b-0 lg:shadow-[inset_-22px_0_26px_-26px_rgba(37,35,31,0.38)]">
                    <div>
                      <p className="eyebrow m-0 text-[var(--ink-soft)]">
                        <span>{book.coverImprint || "PERSONAL ARCHIVE"}</span>
                        {book.yearLabel && (
                          <>
                            <span className="eyebrow__line" />
                            <span>{book.yearLabel}</span>
                          </>
                        )}
                      </p>

                      <div className="mt-7 flex items-start gap-6">
                        <BookMotifPreview book={book} size="md" />
                        <div>
                          <h1
                            className="m-0 text-3xl sm:text-5xl font-normal tracking-tight leading-[1.03]"
                            style={{ fontFamily: "var(--serif)" }}
                          >
                            {book.title}
                          </h1>
                          {book.subtitle && (
                            <p
                              className="mt-2 text-lg italic text-[var(--ink-soft)]"
                              style={{ fontFamily: "var(--serif)" }}
                            >
                              {book.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {book.description && (
                        <p
                          className="mt-8 text-base leading-relaxed text-[#38332c]"
                          style={{ fontFamily: "var(--serif)" }}
                        >
                          {book.description}
                        </p>
                      )}
                    </div>

                    {book.quote && (
                      <blockquote className="mt-8 border-l-2 border-[var(--accent)] pl-4">
                        <p
                          className="m-0 text-base italic text-[#36312b]"
                          style={{ fontFamily: "var(--serif)" }}
                        >
                          “{book.quote}”
                        </p>
                        {book.quoteBy && (
                          <cite className="mt-1.5 block text-[10px] font-semibold tracking-widest uppercase not-italic text-[var(--ink-soft)]">
                            {book.quoteBy}
                          </cite>
                        )}
                      </blockquote>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center bg-[#f3ede1] p-8 sm:p-12 text-center lg:col-span-6">
                    <BookOpen className="h-9 w-9 text-[var(--accent)] opacity-75" />
                    <h2
                      className="mt-4 mb-2 text-3xl font-normal"
                      style={{ fontFamily: "var(--serif)" }}
                    >
                      Open pages ready for memories
                    </h2>
                    <p className="max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
                      Write a keepsake note, your story paragraphs, and upload your photographs. They will appear right inside this book spread.
                    </p>
                    <Link
                      href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                      className="mt-6 inline-flex items-center gap-2 bg-[var(--ink)] px-6 py-3 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      <span>Write First Memory</span>
                    </Link>
                  </div>
                </div>
              ) : (
                /* Open Two-Page Memory Spread: Left = Notes & Paragraphs, Right = Uploaded Photos */
                <div className="grid min-h-[560px] lg:grid-cols-12">
                  {/* Left Page */}
                  <div className="flex flex-col justify-between border-b border-[var(--hairline)] p-6 sm:p-10 lg:col-span-6 lg:border-r lg:border-b-0 lg:shadow-[inset_-22px_0_26px_-26px_rgba(37,35,31,0.38)]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                        <span>{book.title}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {currentMemory.date}
                        </span>
                        {currentMemory.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {currentMemory.location}
                          </span>
                        )}
                        <span className="ml-auto border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-[var(--accent)]">
                          {currentMemory.mood}
                        </span>
                      </div>

                      <h1
                        className="mt-6 mb-0 text-4xl sm:text-5xl font-normal tracking-tight leading-[1.03]"
                        style={{ fontFamily: "var(--serif)" }}
                      >
                        {currentMemory.title}
                      </h1>

                      {currentMemory.note && (
                        <div className="note-slip mt-7">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--accent)]">
                            <StickyNote className="h-3 w-3" />
                            <span>Keepsake Note</span>
                          </div>
                          <p
                            className="m-0 text-base sm:text-lg italic leading-relaxed text-[#322c25]"
                            style={{ fontFamily: "var(--serif)" }}
                          >
                            “{currentMemory.note}”
                          </p>
                        </div>
                      )}

                      <div className="diary-prose mt-7">
                        {currentMemory.paragraphs.length > 0 ? (
                          currentMemory.paragraphs.map((paragraph, idx) => (
                            <p key={idx}>{paragraph}</p>
                          ))
                        ) : (
                          <p className="italic text-[var(--ink-soft)]">
                            No paragraphs written on this page.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-10 flex items-center justify-between border-t border-[var(--hairline)] pt-4 text-xs text-[var(--ink-soft)]">
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(currentMemory.id)}`}
                          className="inline-flex items-center gap-1.5 font-semibold tracking-wider uppercase text-[var(--ink)] no-underline hover:underline"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit Page</span>
                        </Link>
                        <button
                          type="button"
                          onClick={handleDeleteMemory}
                          disabled={deleting}
                          className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer hover:underline disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{deleting ? "Removing..." : "Remove"}</span>
                        </button>
                      </div>
                      <span className="font-serif italic">
                        p. {String(currentIndex * 2 + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </div>

                  {/* Right Page: Uploaded Photos */}
                  <div className="flex flex-col justify-between bg-[#f3ede1] p-6 sm:p-10 lg:col-span-6">
                    <div>
                      <div className="mb-6 flex items-center justify-between border-b border-[var(--hairline)] pb-3">
                        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                          <Images className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span>
                            Photographs · {currentMemory.photos.length}{" "}
                            {currentMemory.photos.length === 1 ? "Frame" : "Frames"}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
                          {currentMemory.albumStyle === "filmstrip"
                            ? "Contact Sheet"
                            : currentMemory.albumStyle === "grid"
                              ? "Editorial Grid"
                              : "Polaroids"}
                        </span>
                      </div>

                      {currentMemory.photos.length === 0 ? (
                        <div className="grid min-h-[280px] place-items-center border border-dashed border-[var(--hairline)] bg-[var(--paper-light)] p-8 text-center">
                          <div>
                            <p className="font-serif text-lg italic text-[var(--ink-soft)]">
                              No photographs attached to this page yet.
                            </p>
                            <Link
                              href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(currentMemory.id)}`}
                              className="mt-3 inline-block border-b border-[var(--ink)] pb-0.5 text-[11px] font-semibold tracking-wider uppercase no-underline"
                            >
                              Add photos to this memory →
                            </Link>
                          </div>
                        </div>
                      ) : currentMemory.albumStyle === "filmstrip" ? (
                        <div className="space-y-4">
                          {currentMemory.photos.map((photo, idx) => (
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
                                  className="max-h-72 w-full object-contain transition duration-300 hover:scale-[1.02]"
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
                      ) : currentMemory.albumStyle === "grid" ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {currentMemory.photos.map((photo, idx) => (
                            <figure
                              key={photo.id}
                              className={`m-0 border border-[var(--hairline)] bg-[var(--paper-light)] p-2.5 ${
                                idx === 0 && currentMemory.photos.length % 2 === 1
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
                              {(photo.caption || currentMemory.photos.length > 1) && (
                                <figcaption className="mt-2 flex items-baseline justify-between gap-2 px-1 text-xs">
                                  <span className="font-serif italic text-[#3a342c]">
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
                      ) : (
                        <div className="grid gap-6 sm:grid-cols-2">
                          {currentMemory.photos.map((photo, idx) => (
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
                              <figcaption className="mt-3 px-1 text-center font-serif text-sm italic text-[#342e27]">
                                {photo.caption || `${currentMemory.date} · Frame ${idx + 1}`}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-10 flex items-center justify-between border-t border-[var(--hairline)] pt-4 text-xs text-[var(--ink-soft)]">
                      <span className="font-serif italic">
                        p. {String(currentIndex * 2 + 2).padStart(2, "0")}
                      </span>

                      {memories.length > 1 ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentIndex <= 0}
                            onClick={() =>
                              setActiveMemoryId(memories[currentIndex - 1].id)
                            }
                            className="inline-flex items-center gap-1 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Prev</span>
                          </button>
                          <button
                            type="button"
                            disabled={currentIndex >= memories.length - 1}
                            onClick={() =>
                              setActiveMemoryId(memories[currentIndex + 1].id)
                            }
                            className="inline-flex items-center gap-1 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)] disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <span>Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold tracking-wider uppercase">
                          {book.yearLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </article>
          </div>
        )}
      </main>

      {currentMemory &&
        lightboxIndex !== null &&
        currentMemory.photos[lightboxIndex] && (
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
                {currentMemory.title} · {String(lightboxIndex + 1).padStart(2, "0")} /{" "}
                {String(currentMemory.photos.length).padStart(2, "0")}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={resolveMediaUrl(currentMemory.photos[lightboxIndex].url)}
                  download={
                    currentMemory.photos[lightboxIndex].originalName || "memory.jpg"
                  }
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
              {currentMemory.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex(
                      (lightboxIndex - 1 + currentMemory.photos.length) %
                        currentMemory.photos.length,
                    )
                  }
                  aria-label="Previous photo"
                  className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/40 hover:bg-black/70 cursor-pointer"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              <img
                src={resolveMediaUrl(currentMemory.photos[lightboxIndex].url)}
                alt={
                  currentMemory.photos[lightboxIndex].caption || currentMemory.title
                }
                className="max-h-[75dvh] max-w-full object-contain shadow-2xl"
              />

              {currentMemory.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex(
                      (lightboxIndex + 1) % currentMemory.photos.length,
                    )
                  }
                  aria-label="Next photo"
                  className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/40 hover:bg-black/70 cursor-pointer"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            <p className="m-0 text-center font-serif text-lg italic text-[#e8dfd0]">
              {currentMemory.photos[lightboxIndex].caption ||
                currentMemory.photos[lightboxIndex].originalName}
            </p>
          </div>
        )}

      <VolumeEditorModal
        key={`${book.id}-${editingVolume}`}
        book={book}
        open={editingVolume}
        onClose={() => setEditingVolume(false)}
        onSave={handleSaveBook}
      />
    </div>
  );
}

export default function BookMemoriesPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--paper)]" />}>
      <BookMemoriesContent />
    </Suspense>
  );
}
