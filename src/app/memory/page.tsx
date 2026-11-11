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
import { StorageStatusPill } from "@/components/StorageStatusPill";
import { defaultBooks } from "@/lib/default-books";
import {
  deleteMemory,
  fetchBooks,
  fetchMemory,
  resolveMediaUrl,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum, StorageMode } from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.6deg", "-1.1deg", "0.7deg"];

function MemoryAlbumContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bookId = params.get("bookId") || "memories-2022";
  const memoryId = params.get("id") || "";

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [memory, setMemory] = useState<MemoryAlbum | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>("server");
  const [hostname, setHostname] = useState<string | undefined>();
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
      setStorageMode(booksRes.mode);
      setHostname(booksRes.hostname);
      setMemory(memRes.memory);
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
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/book?id=${encodeURIComponent(book.id)}`}
            className="header-pill-btn"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{book.shortTitle}</span>
          </Link>
          <Link
            href={`/?book=${encodeURIComponent(book.id)}`}
            className="header-pill-btn"
          >
            <span>3D Shelf</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <StorageStatusPill
            mode={storageMode}
            hostname={hostname}
            onConfigUpdated={() => void loadData()}
          />
          {memory && (
            <>
              <Link
                href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(memory.id)}`}
                className="header-pill-btn"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Album</span>
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="header-pill-btn text-[var(--accent)] cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{deleting ? "Removing..." : "Delete"}</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="diary-container">
        {loading ? (
          <div className="stationery-card p-12 text-center font-serif text-lg italic text-[var(--ink-soft)]">
            Opening your memory album...
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
              className="mt-5 inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline"
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

            <div className="grid lg:grid-cols-12">
              {/* Left Folio: Note & Diary Paragraphs */}
              <div className="border-b border-[var(--hairline)] p-6 sm:p-10 lg:col-span-6 lg:border-r lg:border-b-0 lg:shadow-[inset_-18px_0_24px_-24px_rgba(37,35,31,0.35)]">
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
                      <span className="border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)]">
                        {memory.mood}
                      </span>
                    </div>
                  </div>
                </div>

                <h1
                  className="mt-7 mb-0 text-4xl sm:text-5xl font-normal tracking-tight leading-[1.02]"
                  style={{ fontFamily: "var(--serif)" }}
                >
                  {memory.title}
                </h1>

                {memory.note && (
                  <div className="note-slip mt-8">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--accent)]">
                      <StickyNote className="h-3 w-3" />
                      <span>Keepsake Note</span>
                    </div>
                    <p
                      className="m-0 text-base sm:text-lg italic leading-relaxed text-[#322c25]"
                      style={{ fontFamily: "var(--serif)" }}
                    >
                      “{memory.note}”
                    </p>
                  </div>
                )}

                <div className="diary-prose mt-8">
                  {memory.paragraphs.length > 0 ? (
                    memory.paragraphs.map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))
                  ) : (
                    <p className="italic text-[var(--ink-soft)]">
                      No long-form paragraphs were written for this memory.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Folio: Curated Photo Album */}
              <div className="bg-[#f3ede1] p-6 sm:p-10 lg:col-span-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                    <Images className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>
                      Memory Photo Album · {memory.photos.length}{" "}
                      {memory.photos.length === 1 ? "Frame" : "Frames"}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
                    {memory.albumStyle === "filmstrip"
                      ? "Contact Sheet"
                      : memory.albumStyle === "grid"
                        ? "Editorial Grid"
                        : "Archival Polaroids"}
                  </span>
                </div>

                {memory.photos.length === 0 ? (
                  <div className="grid min-h-[260px] place-items-center border border-dashed border-[var(--hairline)] bg-[var(--paper-light)] p-8 text-center">
                    <div>
                      <p className="font-serif text-lg italic text-[var(--ink-soft)]">
                        No photographs attached to this entry yet.
                      </p>
                      <Link
                        href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(memory.id)}`}
                        className="mt-3 inline-block border-b border-[var(--ink)] pb-0.5 text-[11px] font-semibold tracking-wider uppercase no-underline"
                      >
                        Upload photos to this album →
                      </Link>
                    </div>
                  </div>
                ) : memory.albumStyle === "filmstrip" ? (
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
                        <figcaption className="mt-3 px-1 text-center font-serif text-sm italic text-[#342e27]">
                          {photo.caption || `${memory.date} · Frame ${idx + 1}`}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
              {memory.title} · {String(lightboxIndex + 1).padStart(2, "0")} /{" "}
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
              alt={memory.photos[lightboxIndex].caption || memory.title}
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

