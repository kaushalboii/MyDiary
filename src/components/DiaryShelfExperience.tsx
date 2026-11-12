"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Feather, Images, PenLine, Plus, SlidersHorizontal } from "lucide-react";
import { defaultBooks } from "@/lib/default-books";
import {
  createBook,
  deleteBook,
  fetchBooks,
  fetchMemories,
  loadCachedServerBooks,
  resolveMediaUrl,
  updateBook,
  type BookPatchInput,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum } from "@/lib/types";
import { ShelfEngine, type ShelfMode } from "@/three/ShelfEngine";
import { siteConfig } from "@/three/site-config";
import { StorageSettingsModal } from "./StorageSettingsModal";
import { ThemeToggle } from "./ThemeToggle";
import { VolumeEditorModal } from "./VolumeEditorModal";
import { readDomTheme, useThemeMode } from "@/lib/theme";

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}>
      <span />
    </span>
  );
}

function resolveBookIndex(list: DiaryBook[], bookId: string | null): number {
  if (!bookId) return 0;
  const idx = list.findIndex((b) => b.id === bookId);
  return idx >= 0 ? idx : 0;
}

function ShelfExperienceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBookId = searchParams.get("book");
  const openStorageParam = searchParams.get("storage") === "1";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);

  const initialIndex = useMemo(
    () => resolveBookIndex(defaultBooks, requestedBookId),
    [requestedBookId],
  );

  const theme = useThemeMode();
  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<MemoryAlbum[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [editorState, setEditorState] = useState<
    { mode: "edit"; book: DiaryBook } | { mode: "create" } | null
  >(null);
  const [storageOpen, setStorageOpen] = useState(false);

  const booksRef = useRef(books);
  booksRef.current = books;
  const initialFetchRef = useRef<Promise<void> | null>(null);

  const refreshBooks = useCallback(async () => {
    const res = await fetchBooks();
    booksRef.current = res.books;
    setBooks(res.books);
    engineRef.current?.syncBooks(res.books);
  }, []);

  useEffect(() => {
    const cached = loadCachedServerBooks();
    if (cached && cached.length > 0) {
      booksRef.current = cached;
      setBooks(cached);
    }
    initialFetchRef.current = refreshBooks();
    const handler = () => {
      void refreshBooks();
    };
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [refreshBooks]);

  // Allow hidden settings trigger only via ?storage=1 or Ctrl/Cmd+Shift+S
  useEffect(() => {
    if (openStorageParam) setStorageOpen(true);
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setStorageOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openStorageParam]);

  // Keep shelf scrolled to ?book=... when searchParams hydrates on static export
  useEffect(() => {
    if (!requestedBookId) return;
    const idx = resolveBookIndex(booksRef.current, requestedBookId);
    setActiveIndex(idx);
    engineRef.current?.browseToImmediate(idx);
  }, [requestedBookId]);

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
      const hasCached = Boolean(loadCachedServerBooks()?.length);
      const waitBudgetMs = hasCached ? 250 : 900;
      await Promise.all([
        document.fonts.ready,
        Promise.race([
          initialFetchRef.current ?? Promise.resolve(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, waitBudgetMs);
          }),
        ]),
      ]);
      if (cancelled || !canvasRef.current) return;

      const urlBook =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("book")
          : null;
      const startIndex = resolveBookIndex(booksRef.current, urlBook);
      setActiveIndex(startIndex);

      engine = new ShelfEngine(
        canvasRef.current,
        booksRef.current,
        {
          onActiveIndex: setActiveIndex,
          onMode: (nextMode, index) => {
            setMode(nextMode);
            setSelectedIndex(index);
          },
          onStatus: () => undefined,
          onReady: () => setReady(true),
          onOpenBook: (index) => {
            const target = booksRef.current[index];
            if (target) router.push(`/book?id=${encodeURIComponent(target.id)}`);
          },
        },
        startIndex,
        readDomTheme(),
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
  }, [router]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
  }, [theme]);

  async function handleSaveVolume(patch: BookPatchInput) {
    if (!editorState) return;
    if (editorState.mode === "create") {
      const res = await createBook(patch);
      setBooks(res.books);
      engineRef.current?.syncBooks(res.books, res.book.id);
      return;
    }
    const targetId = editorState.book.id;
    const res = await updateBook(targetId, patch);
    setBooks(res.books);
    engineRef.current?.syncBooks(res.books, targetId);
  }

  async function handleDeleteVolume(bookId: string) {
    const res = await deleteBook(bookId);
    setBooks(res.books);
    engineRef.current?.syncBooks(res.books, res.books[0]?.id);
  }

  const createDraftBook: DiaryBook = {
    id: "new-book-draft",
    title: "New Diary",
    shortTitle: "New Diary",
    subtitle: "Personal Pages",
    yearLabel: String(new Date().getFullYear()),
    coverImprint: "PERSONAL ARCHIVE",
    coverFooter: "",
    spineMark: String(books.length + 1),
    welcomeNote:
      "Welcome to your new diary pages. Turn the leaf or write whenever you wish.",
    description: "",
    quote: "",
    quoteBy: "",
    format: "Soft Linen Hardcover",
    cover: "#06070B",
    secondary: "#C9D2DC",
    accent: "#8A6BFF",
    ink: "#C9D2DC",
    motif: "lattice",
    coverTemplate: "split-band",
    spineStyle: "banded",
    paperStyle: "cream",
    fontStyle: "serif",
    height: 2.12,
    thickness: 0.22,
    width: 1.3,
  };

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
        aria-label={`Interactive three-dimensional memory shelf of ${books.length} clothbound notebooks. Drag or use arrow keys to browse. Click any spine to inspect, or click again to open your memories.`}
      />

      <header className="site-header">
        <div
          className="wordmark"
          aria-label={`${siteConfig.wordmark}, ${siteConfig.collectionName}`}
        >
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider" />
          <span>{books.length} VOLUMES</span>
        </div>

        <div className="header-actions">
          <ThemeToggle />

          <button
            type="button"
            onClick={() => setEditorState({ mode: "create" })}
            className="header-pill-btn cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>Add Book</span>
          </button>

          <Link
            href={`/compose?bookId=${encodeURIComponent(activeBook.id)}`}
            className="header-pill-btn header-pill-btn--primary"
          >
            <PenLine className="h-3 w-3" />
            <span>Write Memory</span>
          </Link>
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
          {(activeBook.memoryCount ?? 0) > 0 && (
            <span className="ml-2 text-[var(--accent)]">
              {activeBook.memoryCount}{" "}
              {activeBook.memoryCount === 1 ? "MEMORY" : "MEMORIES"}
            </span>
          )}
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
            <span>Inspect book</span>
            <span aria-hidden="true">↗</span>
          </button>
          <Link
            href={`/book?id=${encodeURIComponent(activeBook.id)}`}
            className="inspect-button inspect-button--accent"
          >
            <span>Open book</span>
            <span aria-hidden="true">→</span>
          </Link>
          <button
            type="button"
            className="inspect-button"
            disabled={isFocused}
            onClick={() => setEditorState({ mode: "edit", book: activeBook })}
            aria-label={`Customize ${activeBook.title}`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Customize</span>
          </button>
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
          <span>CLICK SPINE TO INSPECT</span>
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
                <p className="eyebrow m-0">
                  {selectedBook.coverImprint || siteConfig.editionEyebrow}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setEditorState({ mode: "edit", book: selectedBook })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1 text-[9px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Customize Book</span>
                </button>
              </div>

              <h2 className="mt-3">{selectedBook.title}</h2>
              <p className="book-details__author">{selectedBook.subtitle}</p>
              {selectedBook.description && (
                <p className="book-details__description">
                  {selectedBook.description}
                </p>
              )}

              {selectedBook.quote && (
                <blockquote>
                  <p>“{selectedBook.quote}”</p>
                  {selectedBook.quoteBy && <cite>{selectedBook.quoteBy}</cite>}
                </blockquote>
              )}

              {/* Preview of memories inside this book */}
              <div className="mt-5 max-w-[500px] border-t border-[var(--hairline)] pt-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                    Inside This Book ({selectedMemories.length})
                  </span>
                </div>

                {loadingMemories ? (
                  <p className="text-xs italic text-[var(--ink-soft)]">
                    Opening pages...
                  </p>
                ) : selectedMemories.length === 0 ? (
                  <p className="font-serif text-sm italic text-[var(--ink-soft)]">
                    No memories bound into {selectedBook.shortTitle} yet.
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
                          href={`/book?id=${encodeURIComponent(selectedBook.id)}&memory=${encodeURIComponent(mem.id)}`}
                          className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-2.5 no-underline transition hover:border-[var(--ink-soft)]"
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
                  <span>Open Book & Memories</span>
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
                  <span>Write New Memory</span>
                </span>
                <span aria-hidden="true">+</span>
              </Link>
            </div>

            <div className="focus-controls" aria-label="Inspection controls">
              <span>Click book to open</span>
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

      <div className="loading-screen" aria-hidden={ready}>
        <div className="loading-screen__mark">
          <span />
          <span />
          <span />
        </div>
        <p>Assembling {books.length} memory volumes</p>
      </div>

      {editorState && (
        <VolumeEditorModal
          key={
            editorState.mode === "create"
              ? `create-${books.length}`
              : `edit-${editorState.book.id}`
          }
          mode={editorState.mode}
          book={editorState.mode === "create" ? createDraftBook : editorState.book}
          shelfBooks={books}
          defaultInsertIndex={Math.min(books.length, activeIndex + 1)}
          open={true}
          onClose={() => setEditorState(null)}
          onSave={handleSaveVolume}
          onDelete={handleDeleteVolume}
        />
      )}

      <StorageSettingsModal
        open={storageOpen}
        onClose={() => setStorageOpen(false)}
        onConnected={() => void refreshBooks()}
      />
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
