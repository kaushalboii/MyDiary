"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bell, BookOpen, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Feather, Images, Mail, PenLine, Plus, Share2, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { defaultBooks } from "@/lib/default-books";
import {
  AUTH_REQUIRED_EVENT,
  acceptSharedBook,
  approveCollaboratorRequest,
  autoSyncOfflineDataIfAny,
  cancelOutgoingBookRequest,
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
  loadFromSharedRegistry,
  parseBookInvitePayload,
  requestBookAccess,
  resolveMediaUrl,
  saveCachedMemories,
  saveToSharedRegistry,
  updateBook,
  type BookPatchInput,
} from "@/lib/storage-client";
import type { CollaboratorRequest, DiaryBook, MemoryAlbum } from "@/lib/types";
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
  const [inviteModalNotice, setInviteModalNotice] = useState<{
    title: string;
    message: string;
    isPending?: boolean;
  } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [approvingEmail, setApprovingEmail] = useState<string | null>(null);
  const [notificationToast, setNotificationToast] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [requestSending, setRequestSending] = useState(false);

  const cachedUser = getCachedUser();
  const userEmail = (cachedUser?.email || "").toLowerCase().trim();

  // Find all pending requests across all books owned by the current user
  const allPendingRequests = useMemo(() => {
    const list: { book: DiaryBook; request: CollaboratorRequest }[] = [];
    const seen = new Set<string>();
    const cleanUserEmail = userEmail ? userEmail.toLowerCase().trim() : "";

    const candidateBooks = [...books];
    if (typeof window !== "undefined") {
      try {
        const localShared = loadFromSharedRegistry();
        for (const sb of localShared) {
          const existing = candidateBooks.find((b) => b.id === sb.id);
          if (!existing) {
            candidateBooks.push(sb);
          } else if (Array.isArray(sb.pendingRequests) && sb.pendingRequests.length > 0) {
            const merged = Array.isArray(existing.pendingRequests) ? [...existing.pendingRequests] : [];
            for (const r of sb.pendingRequests) {
              if (r.email && !merged.some((m) => m.email?.toLowerCase().trim() === r.email.toLowerCase().trim())) {
                merged.push(r);
              }
            }
            existing.pendingRequests = merged;
          }
        }
      } catch {}
    }

    for (const book of candidateBooks) {
      if (Array.isArray(book.pendingRequests) && book.pendingRequests.length > 0) {
        for (const req of book.pendingRequests) {
          const key = `${book.id}-${req.email?.toLowerCase().trim()}`;
          if (!seen.has(key)) {
            seen.add(key);
            // If request is from someone else, it's an incoming request for this owner
            if (!cleanUserEmail || req.email?.toLowerCase().trim() !== cleanUserEmail) {
              list.push({ book, request: req });
            }
          }
        }
      }
    }
    return list;
  }, [books, userEmail]);

  // Outgoing requests sent by this user awaiting creator approval
  const myOutgoingRequests = useMemo(() => {
    const list: { book: DiaryBook; status: string }[] = [];
    const cleanUserEmail = userEmail ? userEmail.toLowerCase().trim() : "";
    const candidateBooks = [...books];
    if (typeof window !== "undefined") {
      try {
        const localShared = loadFromSharedRegistry();
        for (const sb of localShared) {
          const existing = candidateBooks.find((b) => b.id === sb.id);
          if (!existing) {
            candidateBooks.push(sb);
          } else if (Array.isArray(sb.pendingRequests) && sb.pendingRequests.length > 0) {
            const merged = Array.isArray(existing.pendingRequests) ? [...existing.pendingRequests] : [];
            for (const r of sb.pendingRequests) {
              if (r.email && !merged.some((m) => m.email?.toLowerCase().trim() === r.email.toLowerCase().trim())) {
                merged.push(r);
              }
            }
            existing.pendingRequests = merged;
          }
        }
      } catch {}
    }
    for (const book of candidateBooks) {
      if (book.inviteStatus === "pending_approval" || book.inviteStatus === "pending") {
        list.push({
          book,
          status: `Awaiting owner (${book.ownerEmail || "creator"}) approval`,
        });
      } else if (cleanUserEmail && Array.isArray(book.pendingRequests)) {
        const myReq = book.pendingRequests.find(
          (r) => r.email?.toLowerCase().trim() === cleanUserEmail,
        );
        if (myReq) {
          list.push({
            book,
            status: `Awaiting owner (${book.ownerEmail || "creator"}) approval`,
          });
        }
      }
    }
    return list;
  }, [books, userEmail]);

  const booksRef = useRef(books);
  booksRef.current = books;
  const initialFetchRef = useRef<Promise<void> | null>(null);

  const refreshBooks = useCallback(async () => {
    try {
      if (!isUserAuthenticated()) {
        booksRef.current = defaultBooks;
        setBooks(defaultBooks);
        engineRef.current?.syncBooks(defaultBooks);
        return;
      }
      const res = await fetchBooks();
      booksRef.current = res.books;
      setBooks(res.books);
      engineRef.current?.syncBooks(res.books);
    } catch (err) {
      if (isStorageAuthError(err)) {
        booksRef.current = defaultBooks;
        setBooks(defaultBooks);
        engineRef.current?.syncBooks(defaultBooks);
        return;
      }
      throw err;
    }
  }, []);

  // Live polling every 8s so incoming join requests & shared books appear without needing manual refresh
  useEffect(() => {
    const poll = () => {
      if (isUserAuthenticated()) {
        void refreshBooks();
      }
    };
    const timer = setInterval(poll, 6000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        poll();
      }
    };
    const onSyncEvent = () => {
      poll();
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("mydiary_sync");
        bc.onmessage = () => {
          poll();
        };
      } catch {}
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("storage", onSyncEvent);
    window.addEventListener("mydiary_shared_request_updated", onSyncEvent);
    return () => {
      clearInterval(timer);
      bc?.close();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("storage", onSyncEvent);
      window.removeEventListener("mydiary_shared_request_updated", onSyncEvent);
    };
  }, [refreshBooks]);

  const handleApproveRequest = useCallback(
    async (bookId: string, reqEmail: string, action: "approve" | "decline") => {
      setApprovingEmail(reqEmail);
      try {
        await approveCollaboratorRequest(bookId, reqEmail, action);
        await refreshBooks();
        if (action === "approve") {
          setNotificationToast({
            id: Date.now().toString(),
            message: `✓ Accepted ${reqEmail}! This book has been placed on their bookshelf.`,
          });
        } else {
          setNotificationToast({
            id: Date.now().toString(),
            message: `Declined request from ${reqEmail}.`,
          });
        }
      } catch (err) {
        setNotificationToast({
          id: Date.now().toString(),
          message: err instanceof Error ? err.message : "Failed to process request.",
        });
      } finally {
        setApprovingEmail(null);
      }
    },
    [refreshBooks],
  );

  const handleInviteParam = useCallback((rawPayload: string) => {
    const parsed = parseBookInvitePayload(rawPayload);
    if (parsed) {
      setPendingInvite(parsed);
    }
  }, []);

  const handleAcceptInvite = useCallback(
    async (bookToAccept: DiaryBook) => {
      if (!isUserAuthenticated()) {
        setStorageOpen(true);
        setInviteModalNotice({
          title: "Sign In Required",
          message:
            "Please sign in with your Google account first so this shared volume can be securely attached to your shelf.",
        });
        return;
      }
      try {
        const result = await acceptSharedBook(bookToAccept.id, {
          fromInviteLink: true,
          bookData: bookToAccept,
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

        if (result.status === "pending_approval") {
          setInviteModalNotice({
            title: "Join Request Sent",
            message: `Your request to co-author "${bookToAccept.title}" has been sent to the book creator (${bookToAccept.ownerEmail || "the owner"}). Once the owner manually accepts your request from their diary, this volume will immediately appear on your bookshelf!`,
            isPending: true,
          });
          return;
        }

        await refreshBooks();
        const updatedList = await fetchBooks();
        const targetIdx = updatedList.books.findIndex((b) => b.id === bookToAccept.id);
        if (targetIdx >= 0) {
          engineRef.current?.focusBook(targetIdx);
          setSelectedIndex(targetIdx);
          setActiveIndex(targetIdx);
          setMode("inspect");
        }
        setInviteModalNotice({
          title: "Book Placed on Shelf",
          message: `"${bookToAccept.title}" is now placed on your bookshelf! Both accounts can read, upload photos, and write memories together.`,
          isPending: false,
        });
      } catch (err) {
        setPendingInvite(null);
        setInviteModalNotice({
          title: "Unable to Connect Book",
          message:
            err instanceof Error
              ? err.message
              : "Failed to join this book volume. Please try again.",
        });
      }
    },
    [refreshBooks],
  );

  useEffect(() => {
    if (isUserAuthenticated()) {
      const cached = loadCachedServerBooks();
      if (cached && cached.length > 0) {
        booksRef.current = cached;
        setBooks(cached);
      }
    } else {
      booksRef.current = defaultBooks;
      setBooks(defaultBooks);
      try {
        window.localStorage.removeItem("mydiary_server_books_cache_v10");
        window.sessionStorage.removeItem("mydiary_server_books_cache_v10");
      } catch {}
    }
    initialFetchRef.current = refreshBooks();

    const onAuthRequired = () => {
      booksRef.current = defaultBooks;
      setBooks(defaultBooks);
      engineRef.current?.syncBooks(defaultBooks);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);

    // Auto-sync any local drafts or offline created books to cloud
    if (isUserAuthenticated()) {
      void autoSyncOfflineDataIfAny().then((synced) => {
        if (synced && (synced.addedMemories > 0 || synced.updatedBooks > 0)) {
          void refreshBooks();
        }
      });
    }

    const handler = () => {
      if (!isUserAuthenticated()) {
        booksRef.current = defaultBooks;
        setBooks(defaultBooks);
        engineRef.current?.syncBooks(defaultBooks);
        return;
      }
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
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
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

  const selectedBookMembers = useMemo(() => {
    if (!selectedBook) return { owner: null, coAuthors: [] as string[], count: 0 };
    const owner = selectedBook.ownerEmail || selectedBook.sharedBy || null;
    const coAuthorsSet = new Set<string>();
    if (typeof selectedBook.collaboratorEmail === "string" && selectedBook.collaboratorEmail.trim()) {
      coAuthorsSet.add(selectedBook.collaboratorEmail.trim().toLowerCase());
    }
    if (Array.isArray(selectedBook.collaborators)) {
      selectedBook.collaborators.forEach((c) => {
        if (typeof c === "string" && c.trim()) coAuthorsSet.add(c.trim().toLowerCase());
      });
    }
    if (Array.isArray(selectedBook.acceptedBy)) {
      selectedBook.acceptedBy.forEach((c) => {
        if (typeof c === "string" && c.trim()) coAuthorsSet.add(c.trim().toLowerCase());
      });
    }
    if (owner) {
      coAuthorsSet.delete(owner.toLowerCase().trim());
    }
    const coAuthors = Array.from(coAuthorsSet);
    const count = (owner ? 1 : 0) + coAuthors.length;
    return { owner, coAuthors, count };
  }, [selectedBook]);
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
          {allPendingRequests.length > 0 && (
            <button
              type="button"
              onClick={() => setNotificationsOpen((v) => !v)}
              className="relative flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 animate-pulse hover:bg-amber-500/25 transition cursor-pointer shadow-sm"
              aria-label={`${allPendingRequests.length} pending co-author requests`}
              title="View Co-Author Requests"
            >
              <Bell className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>{allPendingRequests.length} Request{allPendingRequests.length > 1 ? "s" : ""}</span>
            </button>
          )}

          <ExpandableDock
            ariaLabel="Diary shelf controls"
            securityOpen={storageOpen}
            onSecurityOpenChange={setStorageOpen}
            onStorageConnected={() => void refreshBooks()}
            badgeCount={allPendingRequests.length}
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
              className={`top-dock__btn ${allPendingRequests.length > 0 ? "font-bold text-amber-700 dark:text-amber-300" : ""}`}
              aria-label="Add & Accept Shared Books"
              title="Add a partner's shared book to your shelf or review pending co-author requests"
            >
              <Users className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span>Add & Accept Shared Books</span>
              {allPendingRequests.length > 0 && (
                <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
                  {allPendingRequests.length}
                </span>
              )}
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
              <span>
                {activeBook.collaboratorEmail
                  ? `Shared with ${activeBook.collaboratorEmail.split("@")[0]}`
                  : Array.isArray(activeBook.collaborators) && activeBook.collaborators[0]
                    ? `Shared with ${activeBook.collaborators[0].split("@")[0]}`
                    : activeBook.sharedBy
                      ? `From ${activeBook.sharedBy}`
                      : "Shared Volume"}
              </span>
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
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5 text-xs">
                      <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>In This Book ({selectedBookMembers.count} Member{selectedBookMembers.count === 1 ? "" : "s"})</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-0.5">
                    {/* Owner / Creator */}
                    <div className="flex items-center justify-between rounded-lg bg-[var(--paper)] px-2.5 py-1.5 text-xs border border-emerald-500/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs">👑</span>
                        <span className="font-medium text-[var(--ink)] truncate">
                          {selectedBookMembers.owner || "Volume Creator"}
                        </span>
                      </div>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 shrink-0">
                        Creator
                      </span>
                    </div>

                    {/* Accepted Co-Authors */}
                    {selectedBookMembers.coAuthors.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between rounded-lg bg-[var(--paper)] px-2.5 py-1.5 text-xs border border-emerald-500/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="font-medium text-[var(--ink)] truncate">{email}</span>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 shrink-0">
                          Co-Author · Active
                        </span>
                      </div>
                    ))}

                    {selectedBookMembers.coAuthors.length === 0 && (
                      <p className="text-[11px] italic text-[var(--ink-soft)] m-0 pt-0.5">
                        Shared memory volume · Ready for co-authors to read and write.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Pending Co-Author Requests from shared link (Book Owner can manually accept from diary) */}
              {selectedBook.pendingRequests && selectedBook.pendingRequests.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-amber-600" />
                      {selectedBook.pendingRequests.length} Pending Co-Author Request{selectedBook.pendingRequests.length > 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditorState({ mode: "edit", book: selectedBook })}
                      className="text-[10px] font-semibold uppercase underline hover:text-[var(--ink)] cursor-pointer"
                    >
                      Manage in Studio
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {selectedBook.pendingRequests.map((req) => (
                      <div key={req.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--paper)] p-2">
                        <div className="min-w-0 text-[11px]">
                          <strong>{req.name || req.email.split("@")[0]}</strong>
                          <span className="text-[10px] text-[var(--ink-soft)] block">{req.email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await approveCollaboratorRequest(selectedBook.id, req.email, "approve");
                              await refreshBooks();
                            }}
                            className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
                          >
                            ✓ Accept & Add to Shelf
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await approveCollaboratorRequest(selectedBook.id, req.email, "decline");
                              await refreshBooks();
                            }}
                            className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-[10px] text-[var(--ink-soft)] hover:text-red-600 transition cursor-pointer"
                          >
                            ✕ Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

            {!isUserAuthenticated() ? (
              <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3.5 text-xs text-[var(--ink)] space-y-3">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-[var(--ink-soft)]">Invited by:</span>
                  <span className="font-semibold">{pendingInvite.ownerEmail || "Co-Author Partner"}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--ink-soft)] m-0">
                  Enter your email address to request co-author access from the book owner:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="your.email@gmail.com"
                    value={inviteEmailInput}
                    onChange={(e) => setInviteEmailInput(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    disabled={requestSending || !inviteEmailInput.includes("@")}
                    onClick={async () => {
                      setRequestSending(true);
                      try {
                        const res = await requestBookAccess(pendingInvite.id, {
                          email: inviteEmailInput.trim(),
                          bookData: pendingInvite,
                        });
                        setPendingInvite(null);
                        setInviteModalNotice({
                          title: "Request Sent to Owner",
                          message:
                            res.message ||
                            `Your request to co-author "${pendingInvite.title}" was sent to ${pendingInvite.ownerEmail || "the book owner"}. As soon as they accept in their diary, this volume will appear on your shelf!`,
                          isPending: true,
                        });
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to send request.");
                      } finally {
                        setRequestSending(false);
                      }
                    }}
                    className="rounded-xl bg-[var(--ink)] px-3.5 py-2 text-xs font-semibold text-[var(--paper-light)] disabled:opacity-50 cursor-pointer hover:bg-[var(--walnut-deep)] transition"
                  >
                    {requestSending ? "Sending..." : "Request"}
                  </button>
                </div>
                <div className="pt-1 text-center text-[10px] text-[var(--ink-soft)]">
                  Or{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setPendingInvite(null);
                      setStorageOpen(true);
                    }}
                    className="underline font-semibold text-[var(--ink)] cursor-pointer"
                  >
                    Sign in with Google
                  </button>{" "}
                  to link directly.
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3 text-xs text-[var(--ink-soft)] space-y-1.5">
                <div className="flex items-center justify-between font-medium text-[var(--ink)]">
                  <span>Invited by:</span>
                  <span>{pendingInvite.ownerEmail || "Co-Author Partner"}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--ink-soft)]">
                  <span>Signed in as:</span>
                  <span className="font-semibold text-[var(--ink)]">{userEmail}</span>
                </div>
                <p className="text-[11px] leading-relaxed m-0 pt-1">
                  You were invited to co-author this memory book. When accepted, this volume will be permanently placed on your bookshelf. Both accounts can view entries, upload photos, and read together in real time!
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingInvite(null)}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--ink-soft)] uppercase hover:text-[var(--ink)] cursor-pointer"
              >
                {isUserAuthenticated() ? "Decline" : "Cancel"}
              </button>
              {isUserAuthenticated() && (
                <button
                  type="button"
                  onClick={() => void handleAcceptInvite(pendingInvite)}
                  className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-md"
                >
                  Accept & Place on Shelf
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Live Request Notification Banner for Owner */}
      {allPendingRequests.length > 0 && !notificationsOpen && (
        <aside
          role="region"
          aria-label="Pending Co-Author Requests"
          className="fixed top-20 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-amber-500/40 bg-[var(--paper-light)]/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Co-Author Join Request
                </span>
                <span className="text-[10px] text-[var(--ink-soft)]">
                  Live
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--ink)] leading-snug">
                <strong className="font-semibold">{allPendingRequests[0].request.name || allPendingRequests[0].request.email}</strong> wants to co-author <span className="italic font-serif font-semibold">"{allPendingRequests[0].book.title}"</span>.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={approvingEmail === allPendingRequests[0].request.email}
                  onClick={() =>
                    void handleApproveRequest(
                      allPendingRequests[0].book.id,
                      allPendingRequests[0].request.email,
                      "approve",
                    )
                  }
                  className="rounded-full bg-[var(--ink)] px-3.5 py-1.5 text-xs font-semibold text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  <span>Accept & Add to Shelf</span>
                </button>
                <button
                  type="button"
                  disabled={approvingEmail === allPendingRequests[0].request.email}
                  onClick={() =>
                    void handleApproveRequest(
                      allPendingRequests[0].book.id,
                      allPendingRequests[0].request.email,
                      "decline",
                    )
                  }
                  className="rounded-full border border-[var(--hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] transition cursor-pointer disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Notifications Modal for Viewing All Requests */}
      {notificationsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setNotificationsOpen(false)}
              className="absolute top-4 right-4 rounded-full p-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[var(--ink)]">
                  Co-Author Requests
                </h3>
                <p className="text-xs text-[var(--ink-soft)]">
                  Approve partners who requested to join your memory books.
                </p>
              </div>
            </div>

            {allPendingRequests.length === 0 ? (
              <p className="text-xs text-[var(--ink-soft)] py-6 text-center">
                No pending co-author requests right now.
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {allPendingRequests.map(({ book, request }) => (
                  <div
                    key={`${book.id}-${request.email}`}
                    className="rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--ink)] truncate">
                          {request.name || request.email}
                        </p>
                        <p className="text-[10px] text-[var(--ink-soft)]">
                          Requested for <span className="font-serif italic font-semibold">"{book.title}"</span>
                        </p>
                      </div>
                      <span className="text-[10px] text-[var(--ink-soft)] shrink-0">
                        {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : "Pending"}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={approvingEmail === request.email}
                        onClick={() => void handleApproveRequest(book.id, request.email, "decline")}
                        className="rounded-full border border-[var(--hairline)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={approvingEmail === request.email}
                        onClick={() => void handleApproveRequest(book.id, request.email, "approve")}
                        className="rounded-full bg-[var(--ink)] px-3.5 py-1 text-xs font-semibold text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] cursor-pointer shadow-sm flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        <span>Accept & Add to Shelf</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Feedback Toast */}
      {notificationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-emerald-950/90 text-emerald-100 px-4 py-2.5 text-xs shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{notificationToast.message}</span>
          <button
            type="button"
            onClick={() => setNotificationToast(null)}
            className="ml-2 text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
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
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
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

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[var(--ink)]">
                  Co-Author & Shared Books
                </h3>
                <p className="text-xs text-[var(--ink-soft)] m-0">
                  Accept incoming co-author requests or connect partner volumes to your shelf.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Section 1: Incoming Requests to Accept */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5" />
                    Pending Co-Author Requests ({allPendingRequests.length})
                  </span>
                  {allPendingRequests.length > 0 && (
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Needs Your Acceptance
                    </span>
                  )}
                </div>

                {allPendingRequests.length > 0 ? (
                  <div className="space-y-2.5">
                    {allPendingRequests.map(({ book, request }) => (
                      <div
                        key={`${book.id}-${request.email}`}
                        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="grid h-14 w-10 shrink-0 place-items-center rounded border border-black/15 shadow-sm text-white/90"
                            style={{ backgroundColor: book.cover || "#8c3f3d" }}
                          >
                            <BookOpen className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-serif text-base font-bold text-[var(--ink)] truncate">
                                {book.title}
                              </h4>
                              <span className="text-[10px] text-[var(--ink-soft)] shrink-0 ml-2">
                                {request.requestedAt
                                  ? new Date(request.requestedAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Pending"}
                              </span>
                            </div>
                            {book.subtitle && (
                              <p className="font-serif text-xs italic text-[var(--ink-soft)] truncate mt-0.5">
                                {book.subtitle}
                              </p>
                            )}
                            <div className="mt-2 text-xs text-[var(--ink)] leading-snug">
                              <span className="font-semibold">{request.name || request.email}</span>{" "}
                              <span className="text-[var(--ink-soft)] font-mono">
                                ({request.email})
                              </span>{" "}
                              requested to co-author this book with you.
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/20">
                          <button
                            type="button"
                            disabled={approvingEmail === request.email}
                            onClick={() => void handleApproveRequest(book.id, request.email, "decline")}
                            className="rounded-full border border-[var(--hairline)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            disabled={approvingEmail === request.email}
                            onClick={async () => {
                              await handleApproveRequest(book.id, request.email, "approve");
                              const idx = books.findIndex((b) => b.id === book.id);
                              if (idx >= 0) {
                                engineRef.current?.focusBook(idx);
                                setSelectedIndex(idx);
                                setActiveIndex(idx);
                              }
                            }}
                            className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs font-semibold text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Accept & Place on Shelf</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3 text-xs text-[var(--ink-soft)] flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--ink)] block">
                        No pending incoming requests
                      </span>
                      <span>
                        When a partner visits your invite link or requests to join, their request will appear right here with a 1-click Accept button.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Outgoing Requests */}
              {myOutgoingRequests.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-[var(--hairline)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Your Outgoing Join Requests ({myOutgoingRequests.length})
                  </span>
                  <div className="space-y-1.5">
                    {myOutgoingRequests.map(({ book, status }) => (
                      <div
                        key={`outgoing-${book.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="h-6 w-4 rounded-sm border border-black/10 shrink-0"
                            style={{ backgroundColor: book.cover || "#8c3f3d" }}
                          />
                          <div className="min-w-0">
                            <span className="font-medium text-[var(--ink)] truncate block">
                              {book.title}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">
                            {status}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await cancelOutgoingBookRequest(book.id);
                              await refreshBooks();
                            }}
                            className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[10px] text-[var(--ink-soft)] hover:text-red-600 transition cursor-pointer"
                            title="Cancel / remove this join request"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 3: Import via Invite Link or Code */}
              <div className="space-y-2.5 pt-3 border-t border-[var(--hairline)]">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  Import Partner Volume via Invite Link / Share Code:
                </label>
                <textarea
                  rows={2}
                  value={joinInput}
                  onChange={(e) => {
                    setJoinInput(e.target.value);
                    setJoinError(null);
                  }}
                  placeholder="Paste https://kaushalboii.github.io/MyDiary/?invite=... or book code here"
                  className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-2.5 text-xs font-mono placeholder:italic placeholder:font-sans placeholder:text-[var(--ink-soft)]/50 focus:border-[var(--ink)] focus:outline-none transition resize-none"
                />

                {joinError && (
                  <p className="text-xs font-medium text-[var(--accent)] m-0">
                    {joinError}
                  </p>
                )}

                <p className="text-[11px] leading-relaxed text-[var(--ink-soft)] m-0">
                  💡 Pasting a link directly connects and places that volume onto your bookshelf.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5 shrink-0 pt-3 border-t border-[var(--hairline)]">
              <button
                type="button"
                onClick={() => {
                  setJoinModalOpen(false);
                  setJoinInput("");
                  setJoinError(null);
                }}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold uppercase text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
              >
                Close
              </button>
              {joinInput.trim() && (
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal for Invite Acceptance & Owner Approval */}
      {inviteModalNotice && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--paper-light)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  inviteModalNotice.isPending
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {inviteModalNotice.isPending ? (
                  <Mail className="h-5 w-5" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-lg font-bold text-[var(--ink)]">
                  {inviteModalNotice.title}
                </h3>
                <p className="mt-1 text-xs text-[var(--ink-soft)] leading-relaxed m-0">
                  {inviteModalNotice.message}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInviteModalNotice(null)}
                className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-md"
              >
                Got it
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
