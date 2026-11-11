"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Feather, Images, PenLine, SlidersHorizontal } from "lucide-react";
import { defaultBooks } from "@/lib/default-books";
import {
  fetchBooks,
  fetchMemories,
  resolveMediaUrl,
  updateBook,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum, StorageMode } from "@/lib/types";
import { ShelfEngine, type ShelfMode } from "@/three/ShelfEngine";
import { siteConfig } from "@/three/site-config";
import { StorageStatusPill } from "./StorageStatusPill";
import { VolumeEditorModal } from "./VolumeEditorModal";

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}>
      <span />
    </span>
  );
}

function ShelfExperienceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBookId = searchParams.get("book");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);

  const initialIndex = useMemo(() => {
    if (!requestedBookId) return 0;
    const idx = defaultBooks.findIndex((b) => b.id === requestedBookId);
    return idx >= 0 ? idx : 0;
  }, [requestedBookId]);

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Preparing your memory library");
  const [storageMode, setStorageMode] = useState<StorageMode>("server");
  const [storageHostname, setStorageHostname] = useState<string | undefined>();
  const [selectedMemories, setSelectedMemories] = useState<MemoryAlbum[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [editingVolume, setEditingVolume] = useState(false);

  const booksRef = useRef(books);
  booksRef.current = books;

  const refreshBooks = useCallback(async () => {
    const res = await fetchBooks();
    setBooks(res.books);
    setStorageMode(res.mode);
    setStorageHostname(res.hostname);
    engineRef.current?.syncBooks(res.books);
  }, []);

  useEffect(() => {
    void refreshBooks();
    const handler = () => {
      void refreshBooks();
    };
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [refreshBooks]);

  const activeBook = books[activeIndex] ?? books[0];
  const selectedBook = useMemo(
    () => (selectedIndex === null ? null : books[selectedIndex] ?? null),
    [books, selectedIndex],
  );
  const isFocused = mode !== "browse";

  // Load saved memories preview whenever a book is pulled forward
  useEffect(() => {
    if (!selectedBook) {
      setSelectedMemories([]);
      return;
    }
    let cancelled = false;
    setLoadingMemories(true);
    void fetchMemories({ bookId: selectedBook.id })
      .then((res) => {
        if (!cancelled) setSelectedMemories(res.memories);
      })
      .finally(() => {
        if (!cancelled) setLoadingMemories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBook?.id]);

  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngine | null = null;

    async function start() {
      if (!canvasRef.current) return;
      await document.fonts.ready;
      if (cancelled || !canvasRef.current) return;

      engine = new ShelfEngine(
        canvasRef.current,
        booksRef.current,
        {
          onActiveIndex: setActiveIndex,
          onMode: (nextMode, index) => {
            setMode(nextMode);
            setSelectedIndex(index);
          },
          onStatus: setStatus,
          onReady: () => setReady(true),
          onOpenBook: (index) => {
            const target = booksRef.current[index];
            if (target) router.push(`/book?id=${encodeURIComponent(target.id)}`);
          },
        },
        initialIndex,
      );
      engineRef.current = engine;
      engine.syncBooks(booksRef.current);
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [initialIndex, router]);

  async function handleSaveVolumeDetails(patch: Partial<DiaryBook>) {
    if (!selectedBook) return;
    const { book: updated, mode: nextMode } = await updateBook(selectedBook.id, patch);
    setStorageMode(nextMode);
    const nextList = books.map((b) => (b.id === updated.id ? updated : b));
    setBooks(nextList);
    engineRef.current?.syncBooks(nextList);
  }

  return (
    <main
      className={`press-experience ${ready ? "is-ready" : ""} ${
        isFocused ? "is-focused" : "is-browsing"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="shelf-canvas"
        data-testid="shelf-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Interactive three-dimensional memory shelf of ${books.length} clothbound notebooks. Drag or use arrow keys to browse. Press Enter to inspect the selected volume.`}
      />

      <header className="site-header">
        <div
          className="wordmark"
          aria-label={`${siteConfig.wordmark}, ${siteConfig.collectionName}`}
        >
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider" />
          <span>{siteConfig.collectionName}</span>
        </div>

        <div className="header-actions">
          <StorageStatusPill
            mode={storageMode}
            hostname={storageHostname}
            onConfigUpdated={() => void refreshBooks()}
          />
          <Link
            href={`/compose?bookId=${encodeURIComponent(activeBook.id)}`}
            className="header-pill-btn header-pill-btn--primary"
          >
            <PenLine className="h-3 w-3" />
            <span>Write Memory</span>
          </Link>
          <div className="edition-mark hidden md:grid">
            <span>{books.length} VOLUMES</span>
            <span>01 CONTINUOUS SHELF</span>
          </div>
        </div>
      </header>

      <section
        className="browse-caption"
        aria-hidden={isFocused}
        data-testid="browse-caption"
      >
        <p className="eyebrow">
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span className="eyebrow__line" />
          <span>{String(books.length).padStart(2, "0")}</span>
          <span className="ml-2 text-[var(--accent)]">
            {(activeBook.memoryCount ?? 0) > 0
              ? `${activeBook.memoryCount} ${
                  activeBook.memoryCount === 1 ? "MEMORY" : "MEMORIES"
                }`
              : "READY FOR MEMORIES"}
          </span>
        </p>
        <h1>{activeBook.shortTitle}</h1>
        <p className="browse-caption__author">
          {activeBook.subtitle}
          {(activeBook.photoCount ?? 0) > 0
            ? ` · ${activeBook.photoCount} photos`
            : ""}
        </p>
        <div className="browse-caption__actions">
          <button
            type="button"
            className="inspect-button"
            data-testid="inspect-active"
            disabled={isFocused}
            onClick={() => engineRef.current?.focusBook(activeIndex)}
            aria-label={`Inspect ${activeBook.title}`}
          >
            <span>Inspect volume</span>
            <span aria-hidden="true">↗</span>
          </button>
          <Link
            href={`/book?id=${encodeURIComponent(activeBook.id)}`}
            className="inspect-button inspect-button--accent"
          >
            <span>Open memories</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <button
        type="button"
        className="shelf-arrow shelf-arrow--left"
        data-testid="browse-previous"
        aria-label="Previous volume"
        disabled={isFocused || activeIndex === 0}
        onClick={() => engineRef.current?.browseBy(-1)}
      >
        <ArrowIcon direction="left" />
      </button>
      <button
        type="button"
        className="shelf-arrow shelf-arrow--right"
        data-testid="browse-next"
        aria-label="Next volume"
        disabled={isFocused || activeIndex === books.length - 1}
        onClick={() => engineRef.current?.browseBy(1)}
      >
        <ArrowIcon direction="right" />
      </button>

      <nav className="shelf-index" aria-label="Diary shelf position">
        <div className="shelf-index__ticks">
          {books.map((book, index) => (
            <button
              key={book.id}
              type="button"
              className={`${index === activeIndex ? "is-active" : ""} ${
                (book.memoryCount ?? 0) > 0 ? "has-memories" : ""
              }`}
              title={`${book.title}${
                (book.memoryCount ?? 0) > 0 ? ` (${book.memoryCount} memories)` : ""
              }`}
              aria-label={`Browse to ${book.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              disabled={isFocused}
              onClick={() => engineRef.current?.browseTo(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="input-hint" aria-hidden="true">
          <span>DRAG</span>
          <i />
          <span>SCROLL</span>
          <i />
          <span>ARROW KEYS</span>
          <i />
          <span>CLICK TO INSPECT</span>
        </div>
      </nav>

      <aside
        className="book-details"
        aria-hidden={!isFocused}
        aria-label={
          selectedBook ? `Details for ${selectedBook.title}` : "Book details"
        }
        data-testid="book-details"
      >
        {selectedBook ? (
          <div className="book-details__inner">
            <button
              type="button"
              className="back-button"
              data-testid="return-to-shelf"
              onClick={() => engineRef.current?.returnToShelf()}
            >
              <ArrowIcon direction="left" />
              <span>Return to shelf</span>
            </button>

            <div className="book-details__position">
              <span>{String((selectedIndex ?? 0) + 1).padStart(2, "0")}</span>
              <span>{String(books.length).padStart(2, "0")}</span>
            </div>

            <div className="book-details__copy">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow m-0">{siteConfig.editionEyebrow}</p>
                <button
                  type="button"
                  onClick={() => setEditingVolume(true)}
                  className="inline-flex items-center gap-1.5 border border-[var(--hairline)] px-2.5 py-1 text-[9px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Customize Cover</span>
                </button>
              </div>

              <h2 className="mt-3">{selectedBook.title}</h2>
              <p className="book-details__author">{selectedBook.subtitle}</p>
              <p className="book-details__description">
                {selectedBook.description}
              </p>

              <blockquote>
                <p>“{selectedBook.quote}”</p>
                <cite>{selectedBook.quoteBy}</cite>
              </blockquote>

              <dl>
                <div>
                  <dt>Saved Memories</dt>
                  <dd>
                    {selectedBook.memoryCount ?? 0}{" "}
                    {(selectedBook.memoryCount ?? 0) === 1
                      ? "memory album"
                      : "memory albums"}
                  </dd>
                </div>
                <div>
                  <dt>Album Photos</dt>
                  <dd>
                    {selectedBook.photoCount ?? 0}{" "}
                    {(selectedBook.photoCount ?? 0) === 1
                      ? "photograph"
                      : "photographs"}
                  </dd>
                </div>
              </dl>

              {/* Preview of memories inside this book */}
              <div className="mt-5 max-w-[500px] border-t border-[var(--hairline)] pt-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                    Inside This Volume
                  </span>
                  {selectedMemories.length > 0 && (
                    <Link
                      href={`/book?id=${encodeURIComponent(selectedBook.id)}`}
                      className="text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)] no-underline hover:underline"
                    >
                      View all ({selectedMemories.length}) →
                    </Link>
                  )}
                </div>

                {loadingMemories ? (
                  <p className="text-xs italic text-[var(--ink-soft)]">
                    Opening pages...
                  </p>
                ) : selectedMemories.length === 0 ? (
                  <p className="font-serif text-sm italic text-[var(--ink-soft)]">
                    No memories bound into {selectedBook.shortTitle} yet. Write your first note, paragraph, and photo album inside.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedMemories.slice(0, 3).map((mem) => {
                      const coverPhoto =
                        mem.photos.find((p) => p.id === mem.coverPhotoId) ||
                        mem.photos[0];
                      return (
                        <Link
                          key={mem.id}
                          href={`/memory?bookId=${encodeURIComponent(selectedBook.id)}&id=${encodeURIComponent(mem.id)}`}
                          className="flex items-center gap-3 border border-[var(--hairline)] bg-[var(--paper-light)] p-2.5 no-underline transition hover:border-[var(--ink)]"
                        >
                          {coverPhoto ? (
                            <img
                              src={resolveMediaUrl(coverPhoto.url)}
                              alt={mem.title}
                              className="h-11 w-11 shrink-0 object-cover border border-black/10"
                            />
                          ) : (
                            <div className="grid h-11 w-11 shrink-0 place-items-center bg-[var(--paper-deep)] text-[var(--ink-soft)]">
                              <Feather className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-serif text-sm font-medium">
                              {mem.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--ink-soft)]">
                              <span>{mem.date}</span>
                              {mem.photos.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Images className="h-2.5 w-2.5" />
                                  {mem.photos.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs">→</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              <Link
                className="official-link"
                data-testid="open-volume-memories"
                href={`/book?id=${encodeURIComponent(selectedBook.id)}`}
              >
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Open Memory Book</span>
                </span>
                <span aria-hidden="true">→</span>
              </Link>

              <Link
                className="official-link official-link--secondary"
                data-testid="write-volume-memory"
                href={`/compose?bookId=${encodeURIComponent(selectedBook.id)}`}
              >
                <span className="inline-flex items-center gap-2">
                  <PenLine className="h-3.5 w-3.5" />
                  <span>Write New Memory in {selectedBook.shortTitle}</span>
                </span>
                <span aria-hidden="true">+</span>
              </Link>
            </div>

            <div className="focus-controls" aria-label="Inspection controls">
              <span>Drag to orbit</span>
              <span>Scroll to zoom</span>
              <button
                type="button"
                data-testid="reset-view"
                onClick={() => engineRef.current?.resetFocusView()}
              >
                Reset view
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div
        className="experience-status"
        role="status"
        aria-live="polite"
        data-testid="experience-status"
      >
        <span className="experience-status__dot" />
        <span>{status}</span>
      </div>

      <div className="loading-screen" aria-hidden={ready}>
        <div className="loading-screen__mark">
          <span />
          <span />
          <span />
        </div>
        <p>Assembling {books.length} memory volumes</p>
      </div>

      <p className="independent-note">{siteConfig.independentNote}</p>

      {selectedBook && (
        <VolumeEditorModal
          key={`${selectedBook.id}-${editingVolume}`}
          book={selectedBook}
          open={editingVolume}
          onClose={() => setEditingVolume(false)}
          onSave={handleSaveVolumeDetails}
        />
      )}
    </main>
  );
}

export function DiaryShelfExperience() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--paper)]" />}>
      <ShelfExperienceInner />
    </Suspense>
  );
}
