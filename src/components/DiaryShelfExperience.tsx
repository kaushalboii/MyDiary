"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Feather, Images, Mail, PenLine, Plus, Share2, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { defaultBooks } from "@/lib/default-books";
import {
  AUTH_REQUIRED_EVENT,
  acceptSharedBook,
  autoSyncOfflineDataIfAny,
  createBook,
  createBookInvitePayload,
  deleteBook,
  fetchBooks,
  fetchMemories,
  getCachedUser,
  isStorageAuthError,
  isUserAuthenticated,
  loadCachedMemories,
  loadCachedServerBooks,
  parseBookInvitePayload,
  resolveMediaUrl,
  saveCachedMemories,
  saveToSharedRegistry,
  updateBook,
  type BookPatchInput,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum } from "@/lib/types";
import type { ShelfEngine as ShelfEngineType, ShelfMode } from "@/three/ShelfEngine";
import { siteConfig } from "@/three/site-config";
import { ExpandableDock } from "./ExpandableDock";
import { ThemeToggle } from "./ThemeToggle";
import { readDomTheme, useThemeMode } from "@/lib/theme";

const VolumeEditorModal = dynamic(
  () => import("./VolumeEditorModal").then((m) => m.VolumeEditorModal),
  { ssr: false },
);

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

function UrlParamsSync({
  onBookParam,
  onStorageParam,
  onInviteParam,
}: {
  onBookParam: (bookId: string) => void;
  onStorageParam: () => void;
  onInviteParam: (invitePayload: string) => void;
}) {
  const searchParams = useSearchParams();
  const requestedBookId = searchParams.get("book");
  const openStorageParam = searchParams.get("storage") === "1";
  const inviteParam = searchParams.get("invite");

  useEffect(() => {
    if (requestedBookId) onBookParam(requestedBookId);
  }, [requestedBookId, onBookParam]);

  useEffect(() => {
    if (openStorageParam) onStorageParam();
  }, [openStorageParam, onStorageParam]);

  useEffect(() => {
    if (inviteParam) onInviteParam(inviteParam);
  }, [inviteParam, onInviteParam]);

  return null;
}

function ShelfExperienceInner() {
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ticksRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShelfEngineType | null>(null);

  const theme = useThemeMode();
  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<MemoryAlbum[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [editorState, setEditorState] = useState<
    { mode: "edit"; book: DiaryBook } | { mode: "create" } | null
  >(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<DiaryBook | null>(null);
  const [sharingBook, setSharingBook] = useState<DiaryBook | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const booksRef = useRef(books);
  booksRef.current = books;
  const initialFetchRef = useRef<Promise<void> | null>(null);

  const refreshBooks = useCallback(async () => {
    try {
      const res = await fetchBooks();
      booksRef.current = res.books;
      setBooks(res.books);
      engineRef.current?.syncBooks(res.books);
    } catch (err) {
      if (isStorageAuthError(err)) return;
      throw err;
    }
  }, []);

  const handleInviteParam = useCallback((rawPayload: string) => {
    const parsed = parseBookInvitePayload(rawPayload);
    if (parsed) {
      setPendingInvite(parsed);
    }
  }, []);

  const handleAcceptInvite = useCallback(
    async (bookToAccept: DiaryBook) => {
      try {
        await acceptSharedBook(bookToAccept.id);
        saveToSharedRegistry({
          ...bookToAccept,
          inviteStatus: "accepted",
        });
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("invite");
          window.history.replaceState(
            {},
            "",
            url.pathname + (url.search ? "?" + url.searchParams.toString() : ""),
          );
        }
        setPendingInvite(null);
        await refreshBooks();
        const updatedList = await fetchBooks();
        const targetIdx = updatedList.books.findIndex((b) => b.id === bookToAccept.id);
        if (targetIdx >= 0) {
          engineRef.current?.focusBook(targetIdx);
          setSelectedIndex(targetIdx);
          setActiveIndex(targetIdx);
          setMode("inspect");
        }
      } catch {
        setPendingInvite(null);
      }
    },
    [refreshBooks],
  );

  useEffect(() => {
    const cached = loadCachedServerBooks();
    if (cached && cached.length > 0) {
      booksRef.current = cached;
      setBooks(cached);
    }
    initialFetchRef.current = refreshBooks();

    // Auto-sync any local drafts or offline created books to cloud
    void autoSyncOfflineDataIfAny().then((synced) => {
      if (synced && (synced.addedMemories > 0 || synced.updatedBooks > 0)) {
        void refreshBooks();
      }
    });

    const handler = () => {
      const fresh = loadCachedServerBooks();
      if (fresh && fresh.length > 0) {
        booksRef.current = fresh;
        setBooks(fresh);
        engineRef.current?.syncBooks(fresh);
      }
      void autoSyncOfflineDataIfAny().then(() => {
        void refreshBooks();
      });
    };
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [refreshBooks]);

  // Allow hidden settings trigger only via ?storage=1 or Ctrl/Cmd+Shift+S
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setStorageOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleBookParam = useCallback((bookId: string) => {
    const idx = resolveBookIndex(booksRef.current, bookId);
    setActiveIndex(idx);
    engineRef.current?.browseToImmediate(idx);
  }, []);

  const handleOpenStorageParam = useCallback(() => {
    setStorageOpen(true);
  }, []);

  const activeBook = books[activeIndex] ?? books[0];
  const selectedBook = useMemo(
    () => (selectedIndex === null ? null : books[selectedIndex] ?? null),
    [books, selectedIndex],
  );
  const isFocused = mode !== "browse";

  // Load saved memories preview whenever a book is pulled forward (SWR instant cache first)
  useEffect(() => {
    if (!selectedBook) {
      setSelectedMemories([]);
      return;
    }
    const cached = loadCachedMemories(selectedBook.id);
    if (cached && cached.length > 0) {
      setSelectedMemories(cached);
      setLoadingMemories(false);
    } else {
      setLoadingMemories(true);
    }

    let cancelled = false;
    void fetchMemories({ bookId: selectedBook.id })
      .then((res) => {
        if (!cancelled) {
          setSelectedMemories(res.memories);
          saveCachedMemories(selectedBook.id, res.memories);
        }
      })
      .catch((err) => {
        if (!isStorageAuthError(err) && !cancelled) {
          if (!cached) setSelectedMemories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMemories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBook?.id]);

  useEffect(() => {
    const container = ticksRef.current;
    if (!container || container.scrollWidth <= container.clientWidth + 2) return;
    const activeButton = container.children[activeIndex] as HTMLElement | undefined;
    if (!activeButton) return;
    const targetLeft =
      activeButton.offsetLeft - container.clientWidth * 0.5 + activeButton.offsetWidth * 0.5;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: "smooth",
    });
  }, [activeIndex, books.length]);

  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngineType | null = null;

    async function start() {
      if (!canvasRef.current) return;
      const urlBook =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("book")
          : null;
      const initialStartIndex = resolveBookIndex(booksRef.current, urlBook);
      setActiveIndex(initialStartIndex);

      // Yield to the main thread until idle so FCP, LCP, and interactive UI paint cleanly before WebGL starts
      await new Promise<void>((resolve) => {
        if (typeof window === "undefined") {
          resolve();
          return;
        }
        const win = window as Window & {
          requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
        };
        if (typeof win.requestIdleCallback === "function") {
          win.requestIdleCallback(() => resolve(), { timeout: 800 });
        } else {
          window.setTimeout(resolve, 60);
        }
      });
      if (cancelled || !canvasRef.current) return;

      const hasCached = Boolean(loadCachedServerBooks()?.length);
      const [{ ShelfEngine }] = await Promise.all([
        import("@/three/ShelfEngine"),
        typeof document !== "undefined" && document.fonts?.ready
          ? document.fonts.ready
          : Promise.resolve(),
        !hasCached && initialFetchRef.current
          ? Promise.race([
              initialFetchRef.current,
              new Promise<void>((resolve) => {
                window.setTimeout(resolve, 120);
              }),
            ])
          : Promise.resolve(),
      ]);
      if (cancelled || !canvasRef.current) return;

      const startIndex = resolveBookIndex(booksRef.current, urlBook);
      if (startIndex !== initialStartIndex) setActiveIndex(startIndex);

      engine = new ShelfEngine(
        canvasRef.current,
        booksRef.current,
        {
          onActiveIndex: setActiveIndex,
          onMode: (nextMode, index) => {
            setMode(nextMode);
            setSelectedIndex(index);
            if (nextMode === "browse") {
              setSheetCollapsed(false);
            }
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
      engine.setTheme(readDomTheme());
      if (typeof document !== "undefined" && document.fonts?.status !== "loaded") {
        void document.fonts.ready.then(() => {
          if (!cancelled) {
            engineRef.current?.refreshTypographyTextures();
          }
        });
      }
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
      setEditorState({ mode: "edit", book: res.book });
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
    cover: "#EAE0CE",
    secondary: "#B86B4B",
    accent: "#8E4B32",
    ink: "#261E18",
    motif: "lattice",
    coverTemplate: "clean-minimal",
    spineStyle: "top-cap",
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
        <button
          type="button"
          className="wordmark"
          onClick={() => {
            if (isFocused) {
              engineRef.current?.returnToShelf();
            } else {
              router.push("/");
            }
          }}
          aria-label={`${siteConfig.wordmark} — Return to shelf overview`}
          title="My Diary Home"
        >
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider hidden sm:block" />
          <span className="hidden sm:inline">{books.length} VOLUMES</span>
        </button>

        <div className="header-controls-cluster">
          <ExpandableDock
            ariaLabel="Diary shelf controls"
            securityOpen={storageOpen}
            onSecurityOpenChange={setStorageOpen}
            onStorageConnected={() => void refreshBooks()}
          >
            <Link
              href={`/book?id=${encodeURIComponent(activeBook.id)}`}
              data-testid="open-active"
              className="top-dock__btn top-dock__btn--soft"
              aria-label={`Open ${activeBook.title}`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open</span>
            </Link>

            <button
              type="button"
              className="top-dock__btn"
              data-testid="inspect-active"
              disabled={isFocused}
              onClick={() => engineRef.current?.focusBook(activeIndex)}
              aria-label={`Inspect ${activeBook.title}`}
              title={`Inspect ${activeBook.title}`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Inspect</span>
            </button>

            <button
              type="button"
              className="top-dock__btn"
              data-testid="customize-active"
              onClick={() => {
                setEditorState({ mode: "edit", book: activeBook });
              }}
              aria-label={`Customize ${activeBook.title}`}
              title={`Customize ${activeBook.title}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Customize</span>
            </button>

            <button
              type="button"
              data-testid="add-book"
              onClick={() => setEditorState({ mode: "create" })}
              className="top-dock__btn"
              aria-label="Add Book"
              title="Add Book"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Book</span>
            </button>

            <button
              type="button"
              onClick={() => setJoinModalOpen(true)}
              className="top-dock__btn"
              aria-label="Add Shared Book"
              title="Add a partner's shared book to your shelf"
            >
              <Users className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span>Add Shared Book</span>
            </button>
          </ExpandableDock>

          <ThemeToggle />
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
          {activeBook.isShared && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)] uppercase tracking-wider">
              <Users className="h-2.5 w-2.5" />
              <span>{activeBook.sharedBy ? `From ${activeBook.sharedBy}` : activeBook.collaboratorEmail ? `Shared with ${activeBook.collaboratorEmail.split("@")[0]}` : "Shared Volume"}</span>
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
        <div className="shelf-index__ticks" ref={ticksRef}>
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
        className={`book-details ${sheetCollapsed ? "is-collapsed" : ""}`}
        aria-hidden={!isFocused}
        aria-label={
          selectedBook ? `Details for ${selectedBook.title}` : "Book details"
        }
        data-testid="book-details"
      >
        {selectedBook ? (
          <div className="book-details__inner">
            <div
              className="mobile-sheet-handle"
              onClick={() => {
                const next = !sheetCollapsed;
                setSheetCollapsed(next);
                engineRef.current?.setInspectSheetCollapsed(next);
              }}
              role="button"
              tabIndex={0}
              aria-label={
                sheetCollapsed
                  ? "Expand book details"
                  : "Lower details to view full book"
              }
            >
              <span className="mobile-sheet-handle__pill" />
            </div>

            <div className="book-details__nav-row">
              <button
                type="button"
                className="back-button"
                data-testid="return-to-shelf"
                onClick={() => {
                  setSheetCollapsed(false);
                  engineRef.current?.setInspectSheetCollapsed(false);
                  engineRef.current?.returnToShelf();
                }}
              >
                <ArrowIcon direction="left" />
                <span>Return to shelf</span>
              </button>

              <button
                type="button"
                className="mobile-sheet-toggle"
                onClick={() => {
                  const next = !sheetCollapsed;
                  setSheetCollapsed(next);
                  engineRef.current?.setInspectSheetCollapsed(next);
                }}
                aria-label={
                  sheetCollapsed
                    ? "Expand book details"
                    : "Lower details to view full book"
                }
              >
                {sheetCollapsed ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    <span>View Details</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    <span>View Full Book</span>
                  </>
                )}
              </button>

              <div className="book-details__position">
                <span>{String((selectedIndex ?? 0) + 1).padStart(2, "0")}</span>
                <span>{String(books.length).padStart(2, "0")}</span>
              </div>
            </div>

            <div className="book-details__copy">
              <p className="eyebrow m-0">
                {selectedBook.coverImprint || siteConfig.editionEyebrow}
              </p>

              <h2 className="mt-3">{selectedBook.title}</h2>
              <p className="book-details__author">{selectedBook.subtitle}</p>
              {selectedBook.isShared && selectedBook.inviteStatus === "pending" ? (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-amber-600" />
                      Shared Book Invitation
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleAcceptInvite(selectedBook)}
                      className="rounded-full bg-[var(--ink)] px-3 py-1 text-[10px] font-semibold text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] cursor-pointer"
                    >
                      Accept & Place on Shelf
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90 m-0">
                    {selectedBook.ownerEmail || selectedBook.sharedBy
                      ? `${selectedBook.ownerEmail || selectedBook.sharedBy} invited you to co-author this volume.`
                      : "You have an invitation to co-author this volume."}
                  </p>
                </div>
              ) : selectedBook.isShared ? (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {selectedBook.sharedBy
                      ? `Co-authored · Created by ${selectedBook.sharedBy}`
                      : selectedBook.collaboratorEmail
                        ? `Co-authored with ${selectedBook.collaboratorEmail}`
                        : "Co-authored Volume"}
                  </span>
                </div>
              ) : null}
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
                    Inside This Book
                  </span>
                </div>

                {!isUserAuthenticated() ? (
                  <p className="font-serif text-xs italic text-[var(--ink-soft)] leading-relaxed">
                    Personal memories inside this volume are protected. Sign in to view and read entries.
                  </p>
                ) : loadingMemories ? (
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

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <Link
                  className="official-link flex-1"
                  data-testid="open-volume-memories"
                  href={`/book?id=${encodeURIComponent(selectedBook.id)}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Open Book & Memories</span>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>

                <button
                  type="button"
                  data-testid="customize-book-shelf"
                  onClick={() => {
                    setEditorState({ mode: "edit", book: selectedBook });
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-3 text-xs font-semibold tracking-wider text-[var(--ink)] uppercase transition hover:border-[var(--ink)] hover:bg-[var(--paper)] cursor-pointer"
                  aria-label={`Customize ${selectedBook.title}`}
                  title={`Customize ${selectedBook.title}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Customize</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSharingBook(selectedBook)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-3 text-xs font-semibold tracking-wider text-[var(--accent)] uppercase transition hover:border-[var(--accent)] hover:bg-[var(--paper)] cursor-pointer"
                  aria-label={`Share ${selectedBook.title}`}
                  title={`Share ${selectedBook.title}`}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
              </div>
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
        <div className="shelf-book-loader" aria-hidden="true">
          <div className="shelf-book-loader__back" />
          <div className="shelf-book-loader__page" />
          <div className="shelf-book-loader__page shelf-book-loader__page--b" />
          <div className="shelf-book-loader__cover" />
        </div>
        <p>Opening {books.length} memory volumes</p>
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

      {/* Floating Shared Book Invitation Card */}
      {pendingInvite && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div
                className="grid h-12 w-10 shrink-0 place-items-center rounded-md border border-black/10 shadow-sm"
                style={{ backgroundColor: pendingInvite.cover || "#8c3f3d" }}
              >
                <BookOpen className="h-5 w-5 text-white/90" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
                  <Sparkles className="h-3 w-3" />
                  <span>Shared Memory Book Invitation</span>
                </div>
                <h3 className="mt-1 font-serif text-lg font-bold text-[var(--ink)]">
                  {pendingInvite.title}
                </h3>
                {pendingInvite.subtitle && (
                  <p className="font-serif text-xs italic text-[var(--ink-soft)] mt-0.5">
                    {pendingInvite.subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3 text-xs text-[var(--ink-soft)] space-y-1.5">
              <div className="flex items-center justify-between font-medium text-[var(--ink)]">
                <span>Invited by:</span>
                <span>{pendingInvite.ownerEmail || "Co-Author Partner"}</span>
              </div>
              <p className="text-[11px] leading-relaxed m-0">
                You were invited to co-author this memory book. When accepted, this volume will be permanently placed on your bookshelf. Both accounts can view entries, upload photos, and read together in real time!
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingInvite(null)}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--ink-soft)] uppercase hover:text-[var(--ink)] cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void handleAcceptInvite(pendingInvite)}
                className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-md"
              >
                Accept & Place on Shelf
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Share Volume Modal */}
      {sharingBook && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSharingBook(null)}
              className="absolute top-4 right-4 rounded-full p-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-10 shrink-0 place-items-center rounded-md border border-black/10 shadow-sm"
                style={{ backgroundColor: sharingBook.cover || "#8c3f3d" }}
              >
                <BookOpen className="h-5 w-5 text-white/90" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
                  Share Memory Volume
                </div>
                <h3 className="font-serif text-lg font-bold text-[var(--ink)] truncate">
                  {sharingBook.title}
                </h3>
                <p className="font-serif text-xs italic text-[var(--ink-soft)] truncate m-0">
                  {sharingBook.subtitle || "Collaborative Diary"}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  Shareable Invite Link (No Sign-In Required)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?invite=${createBookInvitePayload(sharingBook)}`}
                    className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const link = `${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?invite=${createBookInvitePayload(sharingBook)}`;
                      void navigator.clipboard.writeText(link);
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2500);
                    }}
                    className="rounded-lg bg-[var(--ink)] px-3.5 py-2 text-xs font-semibold text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] transition cursor-pointer shrink-0"
                  >
                    {shareCopied ? "Copied!" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>How your partner gets this book:</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90 m-0">
                  Send this link to your partner or open it in your other browser/profile/incognito tab. It will instantly place <strong>“{sharingBook.title}”</strong> on their shelf without requiring Google sign-in!
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSharingBook(null)}
                className="rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-5 py-2 text-xs font-semibold uppercase cursor-pointer hover:border-[var(--ink)]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Join Shared Book Dialog */}
      {joinModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setJoinModalOpen(false);
                setJoinInput("");
                setJoinError(null);
              }}
              className="absolute top-4 right-4 rounded-full p-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[var(--ink)]">
                  Add a Shared Book to Shelf
                </h3>
                <p className="text-xs text-[var(--ink-soft)] m-0">
                  Place a partner&apos;s memory book onto your bookshelf.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  Paste Invite Link or Share Code:
                </label>
                <textarea
                  rows={3}
                  value={joinInput}
                  onChange={(e) => {
                    setJoinInput(e.target.value);
                    setJoinError(null);
                  }}
                  placeholder="Paste https://kaushalboii.github.io/MyDiary/?invite=... or book code here"
                  className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-2.5 text-xs font-mono placeholder:italic placeholder:font-sans placeholder:text-[var(--ink-soft)]/50 focus:border-[var(--ink)] focus:outline-none transition resize-none"
                />
              </div>

              {joinError && (
                <p className="text-xs font-medium text-[var(--accent)] m-0">
                  {joinError}
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-[var(--ink-soft)] m-0">
                💡 No Google sign-in needed. Pasting a share link imports that exact volume so it lives on your shelf.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setJoinModalOpen(false);
                  setJoinInput("");
                  setJoinError(null);
                }}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold uppercase text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  let raw = joinInput.trim();
                  if (!raw) {
                    setJoinError("Please paste an invite link or code.");
                    return;
                  }
                  if (raw.includes("invite=")) {
                    try {
                      const u = new URL(raw);
                      raw = u.searchParams.get("invite") || raw;
                    } catch {
                      const match = raw.match(/invite=([^&]+)/);
                      if (match) raw = match[1];
                    }
                  }
                  const parsed = parseBookInvitePayload(raw);
                  if (!parsed) {
                    setJoinError("Invalid link or code. Please check and try again.");
                    return;
                  }
                  await handleAcceptInvite(parsed);
                  setJoinModalOpen(false);
                  setJoinInput("");
                  setJoinError(null);
                }}
                className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-md"
              >
                Place on My Shelf
              </button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <UrlParamsSync
          onBookParam={handleBookParam}
          onStorageParam={handleOpenStorageParam}
          onInviteParam={handleInviteParam}
        />
      </Suspense>
    </main>
  );
}

export function DiaryShelfExperience() {
  return <ShelfExperienceInner />;
}
