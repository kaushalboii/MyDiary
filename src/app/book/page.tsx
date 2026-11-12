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
  PenLine,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { ExpandableDock } from "@/components/ExpandableDock";
import { FlipBookReader, type BookSpread } from "@/components/FlipBookReader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VolumeEditorModal } from "@/components/VolumeEditorModal";
import { defaultBooks } from "@/lib/default-books";
import {
  deleteBook,
  deleteMemory,
  fetchBooks,
  fetchMemories,
  isStorageAuthError,
  resolveMediaUrl,
  updateBook,
  type BookPatchInput,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum } from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.5deg", "-1.1deg", "0.7deg"];

function BookMemoriesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedBookId = params.get("id") || "";
  const requestedMemoryId = params.get("memory") || "";

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [memories, setMemories] = useState<MemoryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [editingVolume, setEditingVolume] = useState(false);
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const [lightboxState, setLightboxState] = useState<{
    memory: MemoryAlbum;
    index: number;
  } | null>(null);

  const resolvedBookId = useMemo(() => {
    if (requestedBookId && books.some((b) => b.id === requestedBookId)) {
      return requestedBookId;
    }
    return requestedBookId || books[0]?.id || "memories-2022";
  }, [requestedBookId, books]);

  const loadData = useCallback(
    async (preserveSpread = false) => {
      setLoading(true);
      try {
        const booksRes = await fetchBooks();
        setBooks(booksRes.books);
        const targetId =
          requestedBookId && booksRes.books.some((b) => b.id === requestedBookId)
            ? requestedBookId
            : booksRes.books[0]?.id || "memories-2022";

        const memRes = await fetchMemories({ bookId: targetId });
        setMemories(memRes.memories);

        if (!preserveSpread) {
          if (requestedMemoryId) {
            const memIdx = memRes.memories.findIndex(
              (m) => m.id === requestedMemoryId,
            );
            setActiveSpreadIndex(memIdx >= 0 ? memIdx + 1 : 0);
          } else if (memRes.memories.length > 0) {
            setActiveSpreadIndex(1);
          } else {
            setActiveSpreadIndex(0);
          }
        }
      } catch (err) {
        if (isStorageAuthError(err)) return;
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requestedBookId, requestedMemoryId],
  );

  useEffect(() => {
    void loadData();
    const handler = () => void loadData();
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [loadData]);

  const book = useMemo(
    () => books.find((b) => b.id === resolvedBookId) || books[0],
    [books, resolvedBookId],
  );

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightboxState) return;
    function onKey(e: KeyboardEvent) {
      if (!lightboxState) return;
      const total = lightboxState.memory.photos.length;
      if (e.key === "Escape") setLightboxState(null);
      if (e.key === "ArrowRight")
        setLightboxState((prev) =>
          prev ? { ...prev, index: (prev.index + 1) % total } : null,
        );
      if (e.key === "ArrowLeft")
        setLightboxState((prev) =>
          prev ? { ...prev, index: (prev.index - 1 + total) % total } : null,
        );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxState]);

  async function handleSaveBook(patch: BookPatchInput) {
    const res = await updateBook(book.id, patch);
    setBooks(res.books);
  }

  async function handleDeleteBook(id: string) {
    const res = await deleteBook(id);
    setBooks(res.books);
    const next = res.books[0];
    if (next) {
      router.push(`/book?id=${encodeURIComponent(next.id)}`);
    } else {
      router.push("/");
    }
  }

  async function handleDeleteMemory(mem: MemoryAlbum) {
    if (!window.confirm(`Remove "${mem.title}" from ${book.title}?`)) {
      return;
    }
    setDeletingMemoryId(mem.id);
    try {
      await deleteMemory(mem.id);
      await loadData(true);
    } finally {
      setDeletingMemoryId(null);
    }
  }

  const spreads: BookSpread[] = useMemo(() => {
    const defaultWelcome =
      "Welcome to your quiet blank pages. Turn the leaf or write whenever you wish.";
    const welcomeText = book.welcomeNote?.trim() || defaultWelcome;

    const welcomeSpread: BookSpread = {
      id: "opening-welcome",
      label: "Opening Pages",
      left: (
        <div className="flex flex-1 flex-col justify-between">
          <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--ink-soft)]">
            {book.coverImprint || "Personal Archive"}
          </div>
          <div className="my-auto flex flex-col items-center py-8 text-center">
            <div
              className="h-2.5 w-2.5 rotate-45"
              style={{ backgroundColor: book.accent }}
              aria-hidden="true"
            />
            {book.spineMark && (
              <div className="mt-5 font-serif text-3xl italic text-[var(--page-ink)]">
                {book.spineMark}
              </div>
            )}
            <div className="mt-2 text-xs tracking-[0.18em] uppercase text-[var(--ink-soft)]">
              {book.yearLabel}
            </div>
          </div>
          <div className="text-[11px] italic opacity-45">p. 01</div>
        </div>
      ),
      right: (
        <div className="flex flex-1 flex-col justify-between">
          <div className="my-auto py-6 sm:px-4">
            <h1 className="m-0 text-3xl sm:text-4xl font-normal tracking-tight leading-tight text-[var(--page-ink)]">
              {book.title}
            </h1>
            <p className="mt-5 max-w-md text-base sm:text-lg leading-relaxed text-[var(--page-ink-muted)]">
              {welcomeText}
            </p>

            {memories.length > 0 ? (
              <div className="mt-8 border-t border-[var(--hairline)] pt-5">
                <div className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                  Chapters ({memories.length})
                </div>
                <div className="space-y-1.5">
                  {memories.map((mem, idx) => (
                    <button
                      key={mem.id}
                      type="button"
                      onClick={() => setActiveSpreadIndex(idx + 1)}
                      className="flex w-full items-baseline justify-between gap-3 py-1 text-left text-sm hover:text-[var(--accent)] cursor-pointer"
                    >
                      <span className="truncate font-medium">
                        {String(idx + 1).padStart(2, "0")}. {mem.title}
                      </span>
                      <span className="shrink-0 text-[11px] opacity-60">
                        {mem.date}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-8">
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-[11px] font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span>Write First Entry</span>
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] italic opacity-45">
            <span>{book.yearLabel}</span>
            <span>p. 02</span>
          </div>
        </div>
      ),
    };

    if (memories.length === 0) {
      const blankSpread1: BookSpread = {
        id: "blank-1",
        label: "Blank Pages · 03–04",
        left: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="text-[11px] italic opacity-40">p. 03</div>
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="flex items-center justify-between text-[11px] italic opacity-50">
              <Link
                href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                className="not-italic text-[10px] font-semibold tracking-wider uppercase opacity-80 no-underline hover:underline"
              >
                + Add entry on this page
              </Link>
              <span>p. 04</span>
            </div>
          </div>
        ),
      };

      const blankSpread2: BookSpread = {
        id: "blank-2",
        label: "Blank Pages · 05–06",
        left: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="text-[11px] italic opacity-40">p. 05</div>
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="text-right text-[11px] italic opacity-40">p. 06</div>
          </div>
        ),
      };

      return [welcomeSpread, blankSpread1, blankSpread2];
    }

    const memorySpreads: BookSpread[] = memories.map((mem, idx) => {
      const pageLeftNum = String((idx + 1) * 2 + 1).padStart(2, "0");
      const pageRightNum = String((idx + 1) * 2 + 2).padStart(2, "0");

      return {
        id: mem.id,
        label: `${mem.title} · pp. ${pageLeftNum}–${pageRightNum}`,
        left: (
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-[0.15em] uppercase text-[var(--ink-soft)]">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {mem.date}
                </span>
                {mem.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {mem.location}
                  </span>
                )}
                <span className="ml-auto rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-0.5 text-[var(--accent)]">
                  {mem.mood}
                </span>
              </div>

              <h2 className="mt-5 mb-0 text-3xl sm:text-4xl font-normal tracking-tight leading-[1.05] text-[var(--page-ink)]">
                {mem.title}
              </h2>

              {mem.note && (
                <div className="note-slip mt-6">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--accent)]">
                    <StickyNote className="h-3 w-3" />
                    <span>Keepsake Note</span>
                  </div>
                  <p className="m-0 text-base italic leading-relaxed text-[var(--page-ink)]">
                    “{mem.note}”
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-4 text-[16px] leading-[1.7] text-[var(--page-ink-muted)]">
                {mem.paragraphs.length > 0 ? (
                  mem.paragraphs.map((paragraph, pIdx) => (
                    <p key={pIdx} className="m-0">
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="m-0 italic text-[var(--ink-soft)]">
                    No paragraphs written on this page.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[var(--hairline)] pt-3.5 text-xs text-[var(--ink-soft)]">
              <div className="flex items-center gap-4">
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(mem.id)}`}
                  className="inline-flex items-center gap-1.5 font-semibold tracking-wider uppercase text-[var(--ink)] no-underline hover:underline"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDeleteMemory(mem)}
                  disabled={deletingMemoryId === mem.id}
                  className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{deletingMemoryId === mem.id ? "Removing..." : "Remove"}</span>
                </button>
              </div>
              <span className="italic">p. {pageLeftNum}</span>
            </div>
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <div className="mb-5 flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                <span className="inline-flex items-center gap-1.5">
                  <Images className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Photographs · {mem.photos.length}
                </span>
                <span>
                  {mem.albumStyle === "filmstrip"
                    ? "Contact Sheet"
                    : mem.albumStyle === "grid"
                      ? "Editorial Grid"
                      : "Polaroids"}
                </span>
              </div>

              {mem.photos.length === 0 ? (
                <div className="grid min-h-[260px] place-items-center border border-dashed border-[var(--hairline)] p-6 text-center">
                  <Link
                    href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(mem.id)}`}
                    className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)] no-underline hover:text-[var(--ink)] hover:underline"
                  >
                    + Attach photographs to this page
                  </Link>
                </div>
              ) : mem.albumStyle === "filmstrip" ? (
                <div className="space-y-3.5">
                  {mem.photos.map((photo, pIdx) => (
                    <div key={photo.id} className="filmstrip-frame">
                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={() => setLightboxState({ memory: mem, index: pIdx })}
                        className="block w-full overflow-hidden bg-black cursor-pointer"
                      >
                        <img
                          src={resolveMediaUrl(photo.url)}
                          alt={photo.caption || `Album frame ${pIdx + 1}`}
                          className="max-h-60 w-full object-contain transition duration-300 hover:scale-[1.02]"
                        />
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#dfd7c7]">
                        <span className="font-mono text-[10px] uppercase text-[#b5aa97]">
                          #{String(pIdx + 1).padStart(2, "0")}
                        </span>
                        <span className="italic">{photo.caption || photo.originalName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : mem.albumStyle === "grid" ? (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {mem.photos.map((photo, pIdx) => (
                    <figure
                      key={photo.id}
                      className={`m-0 border border-[var(--hairline)] bg-[var(--paper-light)] p-2 ${
                        pIdx === 0 && mem.photos.length % 2 === 1 ? "sm:col-span-2" : ""
                      }`}
                    >
                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={() => setLightboxState({ memory: mem, index: pIdx })}
                        className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                      >
                        <img
                          src={resolveMediaUrl(photo.url)}
                          alt={photo.caption || `Photo ${pIdx + 1}`}
                          className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]"
                        />
                      </button>
                      {photo.caption && (
                        <figcaption className="mt-1.5 px-1 text-xs italic text-[var(--page-ink-muted)]">
                          {photo.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  {mem.photos.map((photo, pIdx) => (
                    <figure
                      key={photo.id}
                      className="polaroid-frame m-0"
                      style={{
                        transform: `rotate(${POLAROID_TILTS[pIdx % POLAROID_TILTS.length]})`,
                      }}
                    >
                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={() => setLightboxState({ memory: mem, index: pIdx })}
                        className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                      >
                        <img
                          src={resolveMediaUrl(photo.url)}
                          alt={photo.caption || `Polaroid ${pIdx + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                      <figcaption className="mt-2.5 px-1 text-center text-xs italic text-[var(--page-ink-muted)]">
                        {photo.caption || `${mem.date} · Frame ${pIdx + 1}`}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-[var(--hairline)] pt-3.5 text-right text-xs italic text-[var(--ink-soft)]">
              p. {pageRightNum}
            </div>
          </div>
        ),
      };
    });

    const trailingBlank: BookSpread = {
      id: "trailing-blank",
      label: "New Blank Page",
      left: (
        <div className="flex flex-1 flex-col justify-between">
          <div />
          <div className="text-[11px] italic opacity-40">
            p. {String((memories.length + 1) * 2 + 1).padStart(2, "0")}
          </div>
        </div>
      ),
      right: (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Link
            href={`/compose?bookId=${encodeURIComponent(book.id)}`}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>Write Next Memory</span>
          </Link>
        </div>
      ),
    };

    return [welcomeSpread, ...memorySpreads, trailingBlank];
  }, [book, memories, deletingMemoryId]);

  const safeSpreadIndex = Math.max(0, Math.min(spreads.length - 1, activeSpreadIndex));

  return (
    <div className="diary-page">
      <header className="diary-topbar">
        <div
          className="wordmark hidden sm:flex"
          aria-label={book.shortTitle}
        >
          <span>MY DIARY</span>
        </div>

        <div className="header-controls-cluster">
          <ExpandableDock
            ariaLabel="Book controls"
            onStorageConnected={() => void loadData(true)}
          >
            <Link
              href={`/?book=${encodeURIComponent(book.id)}`}
              className="top-dock__btn top-dock__btn--soft"
              aria-label="Back to 3D Shelf"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Shelf</span>
            </Link>

            <select
              aria-label="Switch book"
              value={book.id}
              onChange={(e) =>
                router.push(`/book?id=${encodeURIComponent(e.target.value)}`)
              }
              className="top-dock__select"
            >
              {books.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {(item.memoryCount ?? 0) > 0 ? ` (${item.memoryCount})` : ""}
                </option>
              ))}
            </select>

            <span className="top-dock__divider" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setEditingVolume(true)}
              className="top-dock__btn"
              aria-label="Customize Book"
              title="Customize Book"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Customize</span>
            </button>

            <Link
              href={`/compose?bookId=${encodeURIComponent(book.id)}`}
              className="top-dock__btn top-dock__btn--primary"
              aria-label="Write Memory"
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Write Memory</span>
            </Link>
          </ExpandableDock>

          <ThemeToggle />
        </div>
      </header>

      <main className="diary-container">
        <FlipBookReader
          book={book}
          spreads={spreads}
          activeIndex={safeSpreadIndex}
          onChangeIndex={setActiveSpreadIndex}
          opening={loading}
        />
      </main>

      {lightboxState && lightboxState.memory.photos[lightboxState.index] && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#1b1916]/95 p-4 sm:p-8 text-[#f6f1e7]"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxState(null);
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs tracking-widest uppercase text-[#bfb6a6]">
              {lightboxState.memory.title} ·{" "}
              {String(lightboxState.index + 1).padStart(2, "0")} /{" "}
              {String(lightboxState.memory.photos.length).padStart(2, "0")}
            </div>
            <div className="flex items-center gap-3">
              <a
                href={resolveMediaUrl(
                  lightboxState.memory.photos[lightboxState.index].url,
                )}
                download={
                  lightboxState.memory.photos[lightboxState.index].originalName ||
                  "memory.jpg"
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
                onClick={() => setLightboxState(null)}
                aria-label="Close lightbox"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden py-4">
            {lightboxState.memory.photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index:
                            (prev.index - 1 + prev.memory.photos.length) %
                            prev.memory.photos.length,
                        }
                      : null,
                  )
                }
                aria-label="Previous photo"
                className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/40 hover:bg-black/70 cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <img
              src={resolveMediaUrl(
                lightboxState.memory.photos[lightboxState.index].url,
              )}
              alt={
                lightboxState.memory.photos[lightboxState.index].caption ||
                lightboxState.memory.title
              }
              className="max-h-[75dvh] max-w-full object-contain shadow-2xl"
            />

            {lightboxState.memory.photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.memory.photos.length,
                        }
                      : null,
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
            {lightboxState.memory.photos[lightboxState.index].caption ||
              lightboxState.memory.photos[lightboxState.index].originalName}
          </p>
        </div>
      )}

      <VolumeEditorModal
        key={`${book.id}-${editingVolume}`}
        mode="edit"
        book={book}
        shelfBooks={books}
        open={editingVolume}
        onClose={() => setEditingVolume(false)}
        onSave={handleSaveBook}
        onDelete={handleDeleteBook}
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
