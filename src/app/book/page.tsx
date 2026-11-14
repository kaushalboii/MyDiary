"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Images,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { ExpandableDock } from "@/components/ExpandableDock";
import { FlipBookReader, type BookSpread } from "@/components/FlipBookReader";
import { FreeformPageSurface } from "@/components/FreeformPageBlocks";
import { MemoryEditorModal } from "@/components/MemoryEditorModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VolumeEditorModal } from "@/components/VolumeEditorModal";
import { defaultBooks } from "@/lib/default-books";
import {
  autoAlignMemoryBlocks,
  buildDefaultLayoutBlocks,
  formatBookPageNumber,
  getMemoryDisplayTitle,
  getPageAccentColor,
  isImagesOnlyMemory,
  partitionMemoryIntoSpreads,
  syncLayoutBlocksWithMemory,
} from "@/lib/memory-layout";
import {
  deleteBook,
  deleteMemory,
  fetchBooks,
  fetchMemories,
  getCachedUser,
  getOfflineDraftCount,
  isStorageAuthError,
  isUserAuthenticated,
  loadCachedMemories,
  loadCachedServerBooks,
  resolveMediaUrl,
  saveCachedMemories,
  sendBookPresence,
  syncOfflineToServer,
  updateBook,
  updateMemory,
  type BookPatchInput,
} from "@/lib/storage-client";
import { AUTH_REQUIRED_EVENT, restoreActiveUserEncryptionKey } from "@/lib/vault-security";
import type {
  ActiveViewer,
  AlbumPhoto,
  AlbumStyle,
  DiaryBook,
  MemoryAlbum,
  MemoryLayoutBlock,
  StorageMode,
} from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.5deg", "-1.1deg", "0.7deg"];

const REQUIRED_ALBUM_STYLES: Array<{
  id: AlbumStyle;
  label: string;
}> = [
  { id: "borderless", label: "Frameless Grid" },
  { id: "polaroid", label: "Archival Polaroid" },
  { id: "portrait", label: "Wedding Album" },
];

function BookMemoriesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedBookId = params.get("id") || "";
  const requestedMemoryId = params.get("memory") || "";

  const [books, setBooks] = useState<DiaryBook[]>(() => loadCachedServerBooks() || defaultBooks);
  const [memories, setMemories] = useState<MemoryAlbum[]>(() => {
    if (typeof window === "undefined" || !requestedBookId) return [];
    return loadCachedMemories(requestedBookId) || [];
  });
  const [storageMode, setStorageMode] = useState<StorageMode>("offline-fallback");
  const [offlineDraftCount, setOfflineDraftCount] = useState(0);
  const [restoringDrafts, setRestoringDrafts] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    const cachedBooks = loadCachedServerBooks();
    const cachedMems = requestedBookId ? loadCachedMemories(requestedBookId) : null;
    return !cachedBooks && !cachedMems;
  });
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [editingVolume, setEditingVolume] = useState(false);
  const [editorInitialTab, setEditorInitialTab] = useState<"cover" | "wordings" | "collaborate" | "memory" | "size">("cover");
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const [arrangingMemoryId, setArrangingMemoryId] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<MemoryAlbum | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draftBlocksByMemory, setDraftBlocksByMemory] = useState<
    Record<string, MemoryLayoutBlock[]>
  >({});
  const [savingLayoutId, setSavingLayoutId] = useState<string | null>(null);
  const [openMenuMemoryId, setOpenMenuMemoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuMemoryId) return;
    function handleClickOutside(e: PointerEvent) {
      if ((e.target as HTMLElement).closest("[data-memory-menu]")) return;
      setOpenMenuMemoryId(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuMemoryId(null);
    }
    window.addEventListener("pointerdown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuMemoryId]);
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
      // SWR: Hydrate immediately from cache with zero delay
      await restoreActiveUserEncryptionKey();
      const cachedB = loadCachedServerBooks();
      const cachedM = requestedBookId ? loadCachedMemories(requestedBookId) : null;
      if (cachedB && cachedB.length > 0) {
        setBooks(cachedB);
      }
      if (cachedM) {
        setMemories(cachedM);
        setLoading(false);
      } else if (!cachedB) {
        setLoading(true);
      }

      try {
        const [booksRes, initialMemRes] = await Promise.all([
          fetchBooks(),
          requestedBookId
            ? fetchMemories({ bookId: requestedBookId })
            : Promise.resolve({ memories: cachedM || [], mode: "offline-fallback" as const }),
        ]);
        setBooks(booksRes.books);
        setStorageMode(booksRes.mode);
        const targetId =
          requestedBookId && booksRes.books.some((b) => b.id === requestedBookId)
            ? requestedBookId
            : booksRes.books[0]?.id || "memories-2022";

        const [memRes, draftCount] = await Promise.all([
          initialMemRes && targetId === requestedBookId
            ? Promise.resolve(initialMemRes)
            : fetchMemories({ bookId: targetId }),
          getOfflineDraftCount(),
        ]);
        setMemories(memRes.memories);
        setOfflineDraftCount(draftCount);

        if (!preserveSpread) {
          if (requestedMemoryId) {
            let targetSpread = 0;
            let sIdx = 1;
            for (const m of memRes.memories) {
              if (m.id === requestedMemoryId) {
                targetSpread = sIdx;
                break;
              }
              sIdx += partitionMemoryIntoSpreads(m).length;
            }
            setActiveSpreadIndex(targetSpread);
          } else if (memRes.memories.length > 0) {
            setActiveSpreadIndex((prev) => (prev === 0 ? 1 : prev));
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

  const [activeViewers, setActiveViewers] = useState<ActiveViewer[]>([]);

  useEffect(() => {
    if (!book?.id) return;
    const user = getCachedUser();
    let tabId = "";
    if (typeof window !== "undefined") {
      tabId = window.sessionStorage.getItem("mydiary_tab_id") || "";
      if (!tabId) {
        tabId = "tab_" + Math.random().toString(36).substring(2, 9);
        window.sessionStorage.setItem("mydiary_tab_id", tabId);
      }
    }
    const info = {
      id: user?.id || tabId,
      email: user?.email || "reader",
      name: user?.displayName || user?.email?.split("@")[0] || "Reader",
      avatarUrl: user?.avatarUrl,
    };

    let isMounted = true;
    async function pingPresence() {
      try {
        const viewers = await sendBookPresence(book.id, info);
        if (isMounted && Array.isArray(viewers)) {
          setActiveViewers(viewers);
        }
      } catch {}
    }

    void pingPresence();
    const interval = setInterval(() => {
      void pingPresence();
    }, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [book?.id]);

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
    const label = getMemoryDisplayTitle(mem);
    if (!window.confirm(`Remove "${label}" from ${book.title}?`)) {
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

  const handleBlocksChange = useCallback(
    async (memId: string, nextBlocks: MemoryLayoutBlock[], commit: boolean) => {
      setDraftBlocksByMemory((prev) => ({ ...prev, [memId]: nextBlocks }));
      if (!commit) return;
      setSavingLayoutId(memId);
      try {
        const res = await updateMemory(memId, { layoutBlocks: nextBlocks });
        setMemories((prev) =>
          prev.map((m) => (m.id === memId ? res.memory : m)),
        );
      } finally {
        setSavingLayoutId(null);
      }
    },
    [],
  );

  const handleAutoAlign = useCallback(
    async (memId: string) => {
      const mem = memories.find((m) => m.id === memId);
      if (!mem) return;
      const aligned = autoAlignMemoryBlocks(mem);
      await handleBlocksChange(memId, aligned, true);
    },
    [memories, handleBlocksChange],
  );

  const handleResetLayout = useCallback(async (memId: string) => {
    setDraftBlocksByMemory((prev) => {
      const next = { ...prev };
      delete next[memId];
      return next;
    });
    setArrangingMemoryId(null);
    setSelectedBlockId(null);
    setSavingLayoutId(memId);
    try {
      const res = await updateMemory(memId, { layoutBlocks: [] });
      setMemories((prev) =>
        prev.map((m) => (m.id === memId ? res.memory : m)),
      );
    } finally {
      setSavingLayoutId(null);
    }
  }, []);

  const handleChangeAlbumStyle = useCallback(
    async (memId: string, nextStyle: AlbumStyle) => {
      setOpenMenuMemoryId(null);
      setDraftBlocksByMemory((prev) => {
        const next = { ...prev };
        delete next[memId];
        return next;
      });
      setArrangingMemoryId(null);
      setSelectedBlockId(null);

      setMemories((prev) =>
        prev.map((m) =>
          m.id === memId
            ? { ...m, albumStyle: nextStyle, layoutBlocks: [] }
            : m,
        ),
      );

      try {
        await updateMemory(memId, { albumStyle: nextStyle, layoutBlocks: [] });
      } catch (err) {
        console.error("Failed to update album style:", err);
      }
    },
    [],
  );

  const handleToggleFrameStyle = useCallback(
    async (memId: string, currentStyle?: AlbumStyle) => {
      const nextStyle: AlbumStyle = currentStyle === "borderless" ? "polaroid" : "borderless";
      await handleChangeAlbumStyle(memId, nextStyle);
    },
    [handleChangeAlbumStyle],
  );

  const renderPhotoCollection = useCallback(
    (mem: MemoryAlbum, photoItems: { photo: AlbumPhoto; idx: number }[]) => {
      // 1. Frameless Grid (Modern Editorial Photobook — full-bleed photo spreads like Image 1, 4, 5)
      if (mem.albumStyle === "borderless") {
        if (photoItems.length === 1) {
          const { photo, idx } = photoItems[0];
          return (
            <div className="h-full w-full flex flex-col justify-center min-h-0">
              <figure className="m-0 h-full w-full rounded-lg sm:rounded-xl overflow-hidden shadow-sm relative group bg-[var(--paper-deep)]/25 flex flex-col">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Photo ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                </button>
                {photo.caption && (
                  <figcaption className="absolute bottom-2 left-2 right-2 rounded-md bg-black/45 backdrop-blur-xs px-2.5 py-1 text-center font-serif text-xs italic text-white/95">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            </div>
          );
        }

        if (photoItems.length === 2) {
          // 2 tall vertical photos filling the full page height (Image 1 right page)
          return (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 h-full w-full min-h-0">
              {photoItems.map(({ photo, idx }) => (
                <figure key={photo.id} className="m-0 h-full w-full rounded-lg sm:rounded-xl overflow-hidden shadow-sm relative group bg-[var(--paper-deep)]/25 flex flex-col min-h-0">
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={() => setLightboxState({ memory: mem, index: idx })}
                    className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                  >
                    <img
                      src={resolveMediaUrl(photo.url)}
                      alt={photo.caption || `Photo ${idx + 1}`}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  </button>
                  {photo.caption && (
                    <figcaption className="absolute bottom-2 left-2 right-2 rounded bg-black/45 backdrop-blur-xs px-2 py-0.5 text-center font-serif text-[10px] italic text-white/95 truncate">
                      {photo.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          );
        }

        if (photoItems.length === 3) {
          // Exactly like Image 1 Left Page!
          // Left column: 1 tall vertical portrait spanning full height
          // Right column: 2 photos stacked vertically
          const [hero, ...stacked] = photoItems;
          return (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 h-full w-full min-h-0">
              {/* Left Column: Full-Height Hero */}
              <figure className="m-0 h-full w-full rounded-lg sm:rounded-xl overflow-hidden shadow-sm relative group bg-[var(--paper-deep)]/25 flex flex-col min-h-0">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: hero.idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(hero.photo.url)}
                    alt={hero.photo.caption || `Photo ${hero.idx + 1}`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                </button>
                {hero.photo.caption && (
                  <figcaption className="absolute bottom-2 left-2 right-2 rounded bg-black/45 backdrop-blur-xs px-2 py-0.5 text-center font-serif text-[10px] italic text-white/95 truncate">
                    {hero.photo.caption}
                  </figcaption>
                )}
              </figure>

              {/* Right Column: 2 Stacked Photos */}
              <div className="flex flex-col gap-2 sm:gap-3 h-full w-full min-h-0">
                {stacked.map(({ photo, idx }) => (
                  <figure key={photo.id} className="m-0 flex-1 h-full w-full rounded-lg sm:rounded-xl overflow-hidden shadow-sm relative group bg-[var(--paper-deep)]/25 flex flex-col min-h-0">
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => setLightboxState({ memory: mem, index: idx })}
                      className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                    >
                      <img
                        src={resolveMediaUrl(photo.url)}
                        alt={photo.caption || `Photo ${idx + 1}`}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                      />
                    </button>
                    {photo.caption && (
                      <figcaption className="absolute bottom-2 left-2 right-2 rounded bg-black/45 backdrop-blur-xs px-2 py-0.5 text-center font-serif text-[10px] italic text-white/95 truncate">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          );
        }

        // 4 photos on 1 page: Clean 2x2 grid filling the full page height
        return (
          <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:gap-2.5 h-full w-full min-h-0">
            {photoItems.map(({ photo, idx }) => (
              <figure key={photo.id} className="m-0 h-full w-full rounded-lg sm:rounded-xl overflow-hidden shadow-sm relative group bg-[var(--paper-deep)]/25 flex flex-col min-h-0">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Photo ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                </button>
                {photo.caption && (
                  <figcaption className="absolute bottom-1.5 left-1.5 right-1.5 rounded bg-black/45 backdrop-blur-xs px-1.5 py-0.5 text-center font-serif text-[9px] italic text-white/95 truncate">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        );
      }

      // 2. Wedding Album (Fine Art Monograph — luxury framing, soft shadows, script captions like Image 2, 5)
      const isPortraitLayout =
        mem.albumStyle === "portrait" || photoItems.length === 1;

      if (isPortraitLayout) {
        if (photoItems.length === 1) {
          const { photo, idx } = photoItems[0];
          return (
            <div className="h-full w-full flex flex-col justify-center min-h-0">
              <figure className="m-0 h-full w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-md relative group border border-[var(--hairline)]/60 bg-[var(--paper-deep)]/20 flex flex-col">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Wedding Portrait`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02] group-hover:brightness-105"
                  />
                </button>
                {photo.caption && (
                  <figcaption className="py-2 px-3 text-center font-serif text-xs italic tracking-wider text-[var(--page-ink)] bg-[var(--paper)]/95 border-t border-[var(--hairline)]">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            </div>
          );
        }

        if (photoItems.length === 2) {
          return (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 h-full w-full min-h-0">
              {photoItems.map(({ photo, idx }) => (
                <figure key={photo.id} className="m-0 h-full w-full rounded-xl overflow-hidden shadow-md relative group border border-[var(--hairline)]/60 bg-[var(--paper-deep)]/20 flex flex-col min-h-0">
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={() => setLightboxState({ memory: mem, index: idx })}
                    className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                  >
                    <img
                      src={resolveMediaUrl(photo.url)}
                      alt={photo.caption || `Wedding Frame ${idx + 1}`}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02] group-hover:brightness-105"
                    />
                  </button>
                  {photo.caption && (
                    <figcaption className="py-1 px-2 text-center font-serif text-[10px] italic tracking-wider text-[var(--page-ink)] bg-[var(--paper)]/95 border-t border-[var(--hairline)] truncate">
                      {photo.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          );
        }

        if (photoItems.length === 3) {
          const [hero, ...stacked] = photoItems;
          return (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 h-full w-full min-h-0">
              {/* Left Column: Full-Height Hero */}
              <figure className="m-0 h-full w-full rounded-xl overflow-hidden shadow-md relative group border border-[var(--hairline)]/60 bg-[var(--paper-deep)]/20 flex flex-col min-h-0">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: hero.idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(hero.photo.url)}
                    alt={hero.photo.caption || `Wedding Hero`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02] group-hover:brightness-105"
                  />
                </button>
                {hero.photo.caption && (
                  <figcaption className="py-1 px-2 text-center font-serif text-[10px] italic tracking-wider text-[var(--page-ink)] bg-[var(--paper)]/95 border-t border-[var(--hairline)] truncate">
                    {hero.photo.caption}
                  </figcaption>
                )}
              </figure>

              {/* Right Column: 2 Stacked Frames */}
              <div className="flex flex-col gap-2.5 sm:gap-3.5 h-full w-full min-h-0">
                {stacked.map(({ photo, idx }) => (
                  <figure key={photo.id} className="m-0 flex-1 h-full w-full rounded-xl overflow-hidden shadow-md relative group border border-[var(--hairline)]/60 bg-[var(--paper-deep)]/20 flex flex-col min-h-0">
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => setLightboxState({ memory: mem, index: idx })}
                      className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                    >
                      <img
                        src={resolveMediaUrl(photo.url)}
                        alt={photo.caption || `Wedding Frame ${idx + 1}`}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02] group-hover:brightness-105"
                      />
                    </button>
                    {photo.caption && (
                      <figcaption className="py-1 px-2 text-center font-serif text-[10px] italic tracking-wider text-[var(--page-ink)] bg-[var(--paper)]/95 border-t border-[var(--hairline)] truncate">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          );
        }

        // 4 photos on 1 page: Fine Art 2x2 grid filling page
        return (
          <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:gap-3 h-full w-full min-h-0">
            {photoItems.map(({ photo, idx }) => (
              <figure key={photo.id} className="m-0 h-full w-full rounded-lg overflow-hidden shadow-md relative group border border-[var(--hairline)]/60 bg-[var(--paper-deep)]/20 flex flex-col min-h-0">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block h-full w-full cursor-pointer overflow-hidden flex-1 relative"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Wedding Frame ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                  />
                </button>
                {photo.caption && (
                  <figcaption className="py-0.5 px-1.5 text-center font-serif text-[9px] italic tracking-wider text-[var(--page-ink)] bg-[var(--paper)]/95 border-t border-[var(--hairline)] truncate">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        );
      }

      // 3. Archival Polaroid Scrapbook (Vacation memory collage like Image 3)
      if (photoItems.length === 1) {
        const { photo, idx } = photoItems[0];
        return (
          <div className="h-full w-full flex flex-col items-center justify-center min-h-0 py-2">
            <figure
              key={photo.id}
              className="polaroid-frame m-0 max-w-sm w-full shadow-lg"
              style={{
                transform: `rotate(${POLAROID_TILTS[idx % POLAROID_TILTS.length]})`,
              }}
            >
              <button
                type="button"
                data-no-flip="true"
                onClick={() => setLightboxState({ memory: mem, index: idx })}
                className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
              >
                <img
                  src={resolveMediaUrl(photo.url)}
                  alt={photo.caption || `Polaroid ${idx + 1}`}
                  className="aspect-square max-h-[38vh] sm:max-h-[320px] w-full object-cover"
                />
              </button>
              <figcaption className="mt-2.5 px-1 text-center font-serif text-xs italic text-[var(--page-ink-muted)]">
                {photo.caption || `${mem.date} · Frame ${idx + 1}`}
              </figcaption>
            </figure>
          </div>
        );
      }

      if (photoItems.length === 2) {
        return (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 h-full w-full min-h-0 items-center py-2">
            {photoItems.map(({ photo, idx }) => (
              <figure
                key={photo.id}
                className="polaroid-frame m-0 shadow-md"
                style={{
                  transform: `rotate(${POLAROID_TILTS[idx % POLAROID_TILTS.length]})`,
                }}
              >
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Polaroid ${idx + 1}`}
                    className="aspect-square max-h-[30vh] sm:max-h-[240px] w-full object-cover"
                  />
                </button>
                <figcaption className="mt-2 px-1 text-center font-serif text-[11px] italic text-[var(--page-ink-muted)] truncate">
                  {photo.caption || `Frame ${idx + 1}`}
                </figcaption>
              </figure>
            ))}
          </div>
        );
      }

      if (photoItems.length === 3) {
        const topOne = photoItems[0];
        const bottomTwo = photoItems.slice(1, 3);
        return (
          <div className="h-full w-full flex flex-col justify-around gap-2 py-2 min-h-0">
            <div className="flex justify-center">
              <figure
                key={topOne.photo.id}
                className="polaroid-frame m-0 max-w-[200px] sm:max-w-[230px] shadow-md"
                style={{
                  transform: `rotate(${POLAROID_TILTS[topOne.idx % POLAROID_TILTS.length]})`,
                }}
              >
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: topOne.idx })}
                  className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                >
                  <img
                    src={resolveMediaUrl(topOne.photo.url)}
                    alt={topOne.photo.caption || `Polaroid ${topOne.idx + 1}`}
                    className="aspect-square max-h-[18vh] sm:max-h-[145px] w-full object-cover"
                  />
                </button>
                <figcaption className="mt-1 px-1 text-center font-serif text-[10px] italic text-[var(--page-ink-muted)] truncate">
                  {topOne.photo.caption || `Frame ${topOne.idx + 1}`}
                </figcaption>
              </figure>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full">
              {bottomTwo.map(({ photo, idx }) => (
                <figure
                  key={photo.id}
                  className="polaroid-frame m-0 shadow-md"
                  style={{
                    transform: `rotate(${POLAROID_TILTS[idx % POLAROID_TILTS.length]})`,
                  }}
                >
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={() => setLightboxState({ memory: mem, index: idx })}
                    className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <img
                      src={resolveMediaUrl(photo.url)}
                      alt={photo.caption || `Polaroid ${idx + 1}`}
                      className="aspect-square max-h-[18vh] sm:max-h-[145px] w-full object-cover"
                    />
                  </button>
                  <figcaption className="mt-1 px-1 text-center font-serif text-[10px] italic text-[var(--page-ink-muted)] truncate">
                    {photo.caption || `Frame ${idx + 1}`}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        );
      }

      // 4 polaroids in scrapbook grid
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:gap-2.5 h-full w-full min-h-0 items-center py-1">
          {photoItems.map(({ photo, idx }) => (
            <figure
              key={photo.id}
              className="polaroid-frame m-0 shadow-md p-1.5! pb-3!"
              style={{
                transform: `rotate(${POLAROID_TILTS[idx % POLAROID_TILTS.length]})`,
              }}
            >
              <button
                type="button"
                data-no-flip="true"
                onClick={() => setLightboxState({ memory: mem, index: idx })}
                className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
              >
                <img
                  src={resolveMediaUrl(photo.url)}
                  alt={photo.caption || `Polaroid ${idx + 1}`}
                  className="aspect-square max-h-[18vh] sm:max-h-[140px] w-full object-cover"
                />
              </button>
              <figcaption className="mt-1 px-1 text-center font-serif text-[9px] italic text-[var(--page-ink-muted)] truncate">
                {photo.caption || `Frame ${idx + 1}`}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    },
    [],
  );

  const memoryFirstSpreadIndex = useMemo(() => {
    const map = new Map<string, number>();
    let sIdx = 1;
    for (const mem of memories) {
      map.set(mem.id, sIdx);
      sIdx += partitionMemoryIntoSpreads(mem).length;
    }
    return map;
  }, [memories]);

  const spreads: BookSpread[] = useMemo(() => {
    const defaultWelcome =
      "Welcome to your quiet blank pages. Turn the leaf or write whenever you wish.";
    const welcomeText = book.welcomeNote?.trim() || defaultWelcome;
    const pageAccent = getPageAccentColor(book);
    const numStyle = book.pageNumberStyle;
    const headerStyle = book.pageHeaderStyle || "minimal";

    const pNum = (n: number) => formatBookPageNumber(n, numStyle);

    const welcomeSpread: BookSpread = {
      id: "opening-welcome",
      label: "Opening Pages",
      left: (
        <div className="flex flex-1 flex-col justify-between">
          <div
            className={`text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--ink-soft)] ${
              headerStyle === "centered" ? "text-center" : ""
            } ${headerStyle === "ruled" ? "border-b border-double border-[var(--hairline)] pb-2" : ""}`}
          >
            {book.coverImprint || "Personal Archive"}
          </div>
          <div className="my-auto flex flex-col items-center py-8 text-center">
            {headerStyle === "botanical" ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: pageAccent }} aria-hidden="true">
                <span className="h-px w-6 bg-current opacity-50" />
                <span>✦</span>
                <span className="h-px w-6 bg-current opacity-50" />
              </div>
            ) : (
              <div
                className="h-2.5 w-2.5 rotate-45"
                style={{ backgroundColor: pageAccent }}
                aria-hidden="true"
              />
            )}
            {book.spineMark && (
              <div className="mt-5 font-serif text-3xl italic text-[var(--page-ink)]">
                {book.spineMark}
              </div>
            )}
            <div className="mt-2 text-xs tracking-[0.18em] uppercase text-[var(--ink-soft)]">
              {book.yearLabel}
            </div>
          </div>
          <div className="text-[11px] italic opacity-45">{pNum(1)}</div>
        </div>
      ),
      right: (
        <div className="flex flex-1 flex-col justify-between">
          <div className={`my-auto py-6 sm:px-4 ${headerStyle === "centered" ? "text-center" : ""}`}>
            <h1 className="m-0 text-3xl sm:text-4xl font-normal tracking-tight leading-tight text-[var(--page-ink)]">
              {book.title}
            </h1>
            <p className={`mt-5 max-w-md text-base sm:text-lg leading-relaxed text-[var(--page-ink-muted)] ${headerStyle === "centered" ? "mx-auto" : ""}`}>
              {welcomeText}
            </p>

            <div className="mt-5 hidden sm:flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-no-flip="true"
                onClick={() => {
                  setEditorInitialTab("cover");
                  setEditingVolume(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-3.5 py-1.5 text-[10px] font-semibold tracking-wider text-[var(--ink)] uppercase hover:border-[var(--ink)] cursor-pointer"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Customize Book</span>
              </button>
            </div>

            {memories.length > 0 ? (
              <div className="mt-8 border-t border-[var(--hairline)] pt-5 text-left">
                <div className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                  Chapters ({memories.length})
                </div>
                <div className="space-y-1.5">
                  {memories.map((mem, idx) => (
                    <button
                      key={mem.id}
                      type="button"
                      onClick={() => setActiveSpreadIndex(memoryFirstSpreadIndex.get(mem.id) ?? idx + 1)}
                      className="flex w-full items-baseline justify-between gap-3 py-1 text-left text-sm hover:text-[var(--accent)] cursor-pointer"
                    >
                      <span className="truncate font-medium">
                        {String(idx + 1).padStart(2, "0")}. {getMemoryDisplayTitle(mem)}
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
                <button
                  type="button"
                  onClick={() => {
                    setEditorInitialTab("memory");
                    setEditingVolume(true);
                  }}
                  className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-[11px] font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span>Write First Entry</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] italic opacity-45">
            <span>{book.yearLabel}</span>
            <span>{pNum(2)}</span>
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
            <div className="text-[11px] italic opacity-40">{pNum(3)}</div>
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="flex items-center justify-between text-[11px] italic opacity-50">
              <Link
                href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                className="hidden sm:inline-block not-italic text-[10px] font-semibold tracking-wider uppercase opacity-80 no-underline hover:underline"
              >
                + Add entry on this page
              </Link>
              <span>{pNum(4)}</span>
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
            <div className="text-[11px] italic opacity-40">{pNum(5)}</div>
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            <div />
            <div className="text-right text-[11px] italic opacity-40">{pNum(6)}</div>
          </div>
        ),
      };

      return [welcomeSpread, blankSpread1, blankSpread2];
    }

    const memorySpreads: BookSpread[] = [];
    let currentSpreadPageNumber = 3;

    for (let memIdx = 0; memIdx < memories.length; memIdx++) {
      const mem = memories[memIdx];
      const displayTitle = getMemoryDisplayTitle(mem);
      const isArranging = arrangingMemoryId === mem.id;
      const hasCustomLayout = Boolean(mem.layoutBlocks && mem.layoutBlocks.length > 0);
      const activeBlocks =
        draftBlocksByMemory[mem.id] ||
        (hasCustomLayout || isArranging ? syncLayoutBlocksWithMemory(mem) : null);

      const isWeddingPortrait =
        mem.albumStyle === "portrait" ||
        (mem.photos.length === 1 && mem.albumStyle !== "filmstrip" && mem.albumStyle !== "grid");

      const makeSpreadToolbarFooter = (pageStr: string) => (
        <div data-no-flip="true" className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3 text-xs text-[var(--ink-soft)] relative z-20">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {isArranging ? (
              <>
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => {
                    setArrangingMemoryId(null);
                    setSelectedBlockId(null);
                  }}
                  className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--ink)] cursor-pointer hover:underline"
                >
                  <Check className="h-3.5 w-3.5 text-[#4e7c53]" />
                  <span>Done</span>
                </button>
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => void handleAutoAlign(mem.id)}
                  className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer hover:underline"
                  title="Automatically arrange blocks into a clean, level grid layout"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto Align</span>
                </button>
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => void handleResetLayout(mem.id)}
                  className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--ink-soft)] cursor-pointer hover:text-[var(--ink)]"
                  title="Restore automatic page placement"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </>
            ) : (
              <>
                {isUserAuthenticated() ? (
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={() => setEditingMemory(mem)}
                    className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--ink)] cursor-pointer hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent(AUTH_REQUIRED_EVENT, {
                          detail: { message: "Sign in to edit this memory." },
                        }),
                      );
                    }}
                    className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--ink)] cursor-pointer hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                )}

                <div className="relative" data-no-flip="true" data-memory-menu="true">
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuMemoryId((prev) => (prev === mem.id ? null : mem.id));
                    }}
                    className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer hover:underline py-0.5 px-1.5 rounded transition-colors"
                    title="Memory Page Options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span>Options</span>
                  </button>

                  {openMenuMemoryId === mem.id && (
                    <>
                      {/* Fixed backdrop to guarantee outside clicks close menu without conflicts */}
                      <div
                        data-no-flip="true"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuMemoryId(null);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setOpenMenuMemoryId(null);
                        }}
                      />
                      <div
                        data-no-flip="true"
                        className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-1.5 shadow-2xl backdrop-blur-md z-50 text-xs animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {/* 1. Required Album Styles Only */}
                        {mem.photos?.length > 0 && (
                          <div className="py-0.5">
                            <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)] flex items-center justify-between">
                              <span>Album Style</span>
                              <SlidersHorizontal className="h-3 w-3 text-[var(--accent)]" />
                            </div>
                            <div className="mt-0.5 space-y-0.5">
                              {REQUIRED_ALBUM_STYLES.map((style) => {
                                const isCurrent =
                                  mem.albumStyle === style.id ||
                                  (!mem.albumStyle && style.id === "borderless");
                                return (
                                  <button
                                    type="button"
                                    key={style.id}
                                    data-no-flip="true"
                                    onClick={() => {
                                      setOpenMenuMemoryId(null);
                                      void handleChangeAlbumStyle(mem.id, style.id);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs cursor-pointer transition-colors ${
                                      isCurrent
                                        ? "bg-[var(--paper-deep)] text-[var(--ink)] font-semibold"
                                        : "text-[var(--ink-soft)] hover:bg-[var(--paper-deep)]/60 hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span className="font-serif">{style.label}</span>
                                    {isCurrent && (
                                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="my-1 border-t border-[var(--hairline)]" />
                          </div>
                        )}

                        {/* 2. Arrange Page */}
                        <button
                          type="button"
                          data-no-flip="true"
                          data-testid={`arrange-memory-${mem.id}`}
                          onClick={() => {
                            setOpenMenuMemoryId(null);
                            if (!isUserAuthenticated()) {
                              window.dispatchEvent(
                                new CustomEvent(AUTH_REQUIRED_EVENT, {
                                  detail: { message: "Sign in to arrange memory blocks." },
                                }),
                              );
                              return;
                            }
                            setDraftBlocksByMemory((prev) => ({
                              ...prev,
                              [mem.id]:
                                prev[mem.id] ||
                                (mem.layoutBlocks?.length
                                  ? syncLayoutBlocksWithMemory(mem)
                                  : buildDefaultLayoutBlocks(mem)),
                            }));
                            setArrangingMemoryId(mem.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium text-[var(--ink)] hover:bg-[var(--paper-deep)] cursor-pointer transition-colors"
                        >
                          <LayoutGrid className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                          <span>Arrange Page Blocks</span>
                        </button>

                        {/* 3. Reset to Default Layout */}
                        {hasCustomLayout && (
                          <button
                            type="button"
                            data-no-flip="true"
                            onClick={() => {
                              setOpenMenuMemoryId(null);
                              void handleResetLayout(mem.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--paper-deep)] cursor-pointer transition-colors"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reset to Default Layout</span>
                          </button>
                        )}

                        {/* 4. Edit Memory */}
                        <button
                          type="button"
                          data-no-flip="true"
                          onClick={() => {
                            setOpenMenuMemoryId(null);
                            if (!isUserAuthenticated()) {
                              window.dispatchEvent(
                                new CustomEvent(AUTH_REQUIRED_EVENT, {
                                  detail: { message: "Sign in to edit this memory." },
                                }),
                              );
                              return;
                            }
                            setEditingMemory(mem);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium text-[var(--ink)] hover:bg-[var(--paper-deep)] cursor-pointer transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                          <span>Edit Story & Photos</span>
                        </button>

                        {/* 5. Remove Memory */}
                        {isUserAuthenticated() && (
                          <>
                            <div className="my-1 border-t border-[var(--hairline)]" />
                            <button
                              type="button"
                              data-no-flip="true"
                              onClick={() => {
                                setOpenMenuMemoryId(null);
                                void handleDeleteMemory(mem);
                              }}
                              disabled={deletingMemoryId === mem.id}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium text-[var(--accent)] hover:bg-[var(--paper-deep)] cursor-pointer transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{deletingMemoryId === mem.id ? "Removing..." : "Remove Memory"}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <span className="italic ml-auto sm:ml-0">
            {savingLayoutId === mem.id ? "Saving…" : pageStr}
          </span>
        </div>
      );

      if (activeBlocks) {
        const leftN = currentSpreadPageNumber;
        const rightN = currentSpreadPageNumber + 1;
        currentSpreadPageNumber += 2;
        const pageLeftStr = pNum(leftN);
        const pageRightStr = pNum(rightN);

        memorySpreads.push({
          id: mem.id,
          label: `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`,
          left: (
            <div className="flex flex-1 flex-col justify-between gap-3">
              {isArranging && (
                <div
                  data-no-flip="true"
                  className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--paper)]/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => {
                        setArrangingMemoryId(null);
                        setSelectedBlockId(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3.5 py-1 text-[11px] font-semibold text-[var(--paper-light)] tracking-wider uppercase hover:bg-[var(--walnut-deep)] cursor-pointer shadow-xs transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Done</span>
                    </button>
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => void handleAutoAlign(mem.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1 text-[11px] font-semibold text-[var(--ink)] tracking-wider uppercase hover:border-[var(--ink)] cursor-pointer transition-colors"
                      title="Automatically arrange blocks into a clean, level grid layout"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Auto Align</span>
                    </button>
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => void handleResetLayout(mem.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)] tracking-wider uppercase hover:text-[var(--ink)] cursor-pointer transition-colors"
                      title="Restore automatic page placement"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                    {mem.photos?.length > 0 && (
                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={() => void handleToggleFrameStyle(mem.id, mem.albumStyle)}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] tracking-wider uppercase hover:border-[var(--ink)] cursor-pointer transition-colors"
                        title={
                          mem.albumStyle === "borderless"
                            ? "Switch to Polaroid outer frame"
                            : "Switch to Frameless Grid (no outer frame)"
                        }
                      >
                        <SlidersHorizontal className="h-3 w-3 text-[var(--accent)]" />
                        <span>{mem.albumStyle === "borderless" ? "Frameless" : "Polaroid"}</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--ink-soft)] tracking-wide hidden sm:inline">
                    Drag items to position · resize with +/-
                  </span>
                </div>
              )}
              <FreeformPageSurface
                memory={mem}
                book={book}
                side="left"
                blocks={activeBlocks}
                editing={isArranging}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                onChangeBlocks={(next, commit) =>
                  void handleBlocksChange(mem.id, next, commit)
                }
                onPhotoClick={(photoIdx) => setLightboxState({ memory: mem, index: photoIdx })}
                surfaceIdPrefix={`book-${mem.id}`}
              />
              {makeSpreadToolbarFooter(pageLeftStr)}
            </div>
          ),
          right: (
            <div className="flex flex-1 flex-col justify-between gap-3">
              {isArranging && (
                <div
                  data-no-flip="true"
                  className="sticky top-0 z-30 flex items-center justify-between gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--paper)]/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                    Right Page Layout
                  </span>
                  <div className="flex items-center gap-2">
                    {mem.photos?.length > 0 && (
                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={() => void handleToggleFrameStyle(mem.id, mem.albumStyle)}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ink)] tracking-wider uppercase hover:border-[var(--ink)] cursor-pointer transition-colors"
                        title={
                          mem.albumStyle === "borderless"
                            ? "Switch to Polaroid outer frame"
                            : "Switch to Frameless Grid (no outer frame)"
                        }
                      >
                        <SlidersHorizontal className="h-3 w-3 text-[var(--accent)]" />
                        <span>{mem.albumStyle === "borderless" ? "Frameless" : "Polaroid"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => void handleAutoAlign(mem.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ink)] tracking-wider uppercase hover:border-[var(--ink)] cursor-pointer transition-colors"
                      title="Automatically arrange blocks into a clean, level grid layout"
                    >
                      <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                      <span>Auto Align</span>
                    </button>
                    <button
                      type="button"
                      data-no-flip="true"
                      onClick={() => {
                        setArrangingMemoryId(null);
                        setSelectedBlockId(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 text-[10px] font-semibold text-[var(--paper-light)] tracking-wider uppercase hover:bg-[var(--walnut-deep)] cursor-pointer transition-colors"
                    >
                      <Check className="h-3 w-3" />
                      <span>Done</span>
                    </button>
                  </div>
                </div>
              )}
              <FreeformPageSurface
                memory={mem}
                book={book}
                side="right"
                blocks={activeBlocks}
                editing={isArranging}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                onChangeBlocks={(next, commit) =>
                  void handleBlocksChange(mem.id, next, commit)
                }
                onPhotoClick={(photoIdx) => setLightboxState({ memory: mem, index: photoIdx })}
                surfaceIdPrefix={`book-${mem.id}`}
              />
              <div className="mt-auto border-t border-[var(--hairline)] pt-3 text-right text-xs italic text-[var(--ink-soft)]">
                {pageRightStr}
              </div>
            </div>
          ),
        });
        continue;
      }

      const partitions = partitionMemoryIntoSpreads(mem);

      partitions.forEach((partition) => {
        const leftN = currentSpreadPageNumber;
        const rightN = currentSpreadPageNumber + 1;
        currentSpreadPageNumber += 2;
        const pageLeftStr = pNum(leftN);
        const pageRightStr = pNum(rightN);

        const isPrimary = partition.isPrimary;
        const spreadSubIdx = partition.spreadSubIndex;
        const totalSubSpreads = partition.totalSubSpreads;
        const spreadLabel =
          totalSubSpreads > 1
            ? isPrimary
              ? `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`
              : `${displayTitle} (${spreadSubIdx + 1}/${totalSubSpreads}) · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`
            : `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`;

        const leftPhotos = partition.leftPhotos;
        const rightPhotos = partition.rightPhotos;

        const isPhotoSpread = isPrimary && leftPhotos.length > 0;

        const leftContent = isPhotoSpread ? (
          <div className="flex flex-1 h-full flex-col justify-between min-h-0">
            <div className="flex flex-1 h-full flex-col min-h-0">
              <div className="mb-2 sm:mb-2.5 flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-[var(--ink-soft)] font-serif shrink-0 border-b border-[var(--hairline)]/70 pb-1.5">
                <span className="font-semibold text-[var(--page-ink)] tracking-wider text-xs sm:text-sm">
                  {mem.title?.trim() && mem.title.trim() !== "Encrypted Entry" ? mem.title : "First"}
                </span>
                <span className="text-[10px] tracking-widest text-[var(--ink-soft)]">
                  {mem.date}{mem.mood ? ` · ${mem.mood}` : ""}
                </span>
              </div>

              {mem.note && (
                <div className="mb-2 px-2 text-center text-xs italic text-[var(--page-ink-muted)] shrink-0 font-serif">
                  “{mem.note}”
                </div>
              )}

              <div className="flex-1 h-full w-full min-h-0">
                {renderPhotoCollection(mem, leftPhotos)}
              </div>
            </div>

            {makeSpreadToolbarFooter(pageLeftStr)}
          </div>
        ) : isPrimary ? (
          <div className="flex flex-1 flex-col justify-between">
            <div className="flex flex-1 flex-col">
              <div
                className={`flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-[0.15em] uppercase text-[var(--ink-soft)] ${
                  headerStyle === "ruled" ? "border-b border-double border-[var(--hairline)] pb-2" : ""
                }`}
              >
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
                {book.isShared && mem.authorName && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2 py-0.5 normal-case font-medium text-[var(--ink)]">
                    <Users className="h-2.5 w-2.5 text-[var(--accent)]" />
                    <span>Added by {mem.authorName}</span>
                  </span>
                )}
                <span
                  className="ml-auto rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-0.5"
                  style={{ color: pageAccent }}
                >
                  {mem.mood}
                </span>
              </div>

              <h2
                className={`mt-4 mb-0 text-2xl sm:text-3xl font-normal tracking-tight leading-[1.08] text-[var(--page-ink)] ${
                  headerStyle === "centered" ? "text-center" : ""
                }`}
              >
                {mem.title?.trim() && mem.title.trim() !== "Encrypted Entry"
                  ? mem.title
                  : "First"}
              </h2>

              {mem.note && (
                <div className="note-slip mt-4" style={{ borderLeftColor: pageAccent }}>
                  <div
                    className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase"
                    style={{ color: pageAccent }}
                  >
                    <StickyNote className="h-3 w-3" />
                    <span>Keepsake Note</span>
                  </div>
                  <p className="m-0 text-sm italic leading-relaxed text-[var(--page-ink)]">
                    “{mem.note}”
                  </p>
                </div>
              )}

              {mem.paragraphs.length > 0 && (
                <div className="mt-4 space-y-3.5 text-[15px] leading-[1.65] text-[var(--page-ink-muted)]">
                  {mem.paragraphs.map((paragraph, pIdx) => (
                    <p key={pIdx} className="m-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {makeSpreadToolbarFooter(pageLeftStr)}
          </div>
        ) : (
          <div className="flex flex-1 h-full flex-col justify-between min-h-0">
            <div className="flex flex-1 h-full flex-col min-h-0">
              <div className="mb-2 sm:mb-2.5 flex items-center justify-between text-[10px] tracking-[0.16em] uppercase text-[var(--ink-soft)] font-serif shrink-0 border-b border-[var(--hairline)]/70 pb-1.5">
                <span className="font-semibold text-[var(--page-ink)] tracking-wider text-xs">
                  {displayTitle}
                </span>
                <span className="text-[10px] tracking-widest text-[var(--ink-soft)]">
                  Gallery Spread
                </span>
              </div>
              <div className="flex-1 h-full w-full min-h-0">
                {renderPhotoCollection(mem, leftPhotos)}
              </div>
            </div>

            {makeSpreadToolbarFooter(pageLeftStr)}
          </div>
        );

        const rightContent = (
          <div className="flex flex-1 h-full flex-col justify-between min-h-0">
            {rightPhotos.length > 0 ? (
              <div className="flex flex-1 h-full flex-col justify-between min-h-0">
                <div className="mb-2 sm:mb-2.5 flex items-center justify-between text-[10px] tracking-[0.16em] uppercase text-[var(--ink-soft)] font-serif shrink-0 border-b border-[var(--hairline)]/70 pb-1.5">
                  <span className="text-[10px] tracking-widest text-[var(--ink-soft)]">
                    {mem.location || book.title}
                  </span>
                  <span className="text-[10px] tracking-widest text-[var(--accent)] font-medium">
                    {mem.albumStyle === "portrait"
                      ? "Wedding Album"
                      : mem.albumStyle === "polaroid"
                        ? "Polaroids"
                        : "Photobook Spread"}
                  </span>
                </div>
                <div className="flex-1 h-full w-full min-h-0">
                  {renderPhotoCollection(mem, rightPhotos)}
                </div>
              </div>
            ) : (
              <div className="my-auto flex flex-col items-center justify-center py-10 text-center opacity-55">
                <div
                  className="h-2 w-2 rotate-45"
                  style={{ backgroundColor: pageAccent }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setEditingMemory(mem)}
                  className="hidden sm:inline-block mt-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)] cursor-pointer hover:text-[var(--ink)] hover:underline"
                >
                  + Add photographs
                </button>
              </div>
            )}

            <div
              className={`text-right text-xs italic text-[var(--ink-soft)] ${
                isWeddingPortrait ? "mt-auto pt-2 opacity-80" : "mt-6 border-t border-[var(--hairline)] pt-3"
              }`}
            >
              {pageRightStr}
            </div>
          </div>
        );

        memorySpreads.push({
          id: `${mem.id}-spread-${spreadSubIdx}`,
          label: spreadLabel,
          left: leftContent,
          right: rightContent,
        });
      });
    }

    const trailingBlank: BookSpread = {
      id: "trailing-blank",
      label: "New Blank Page",
      left: (
        <div className="flex flex-1 flex-col justify-between">
          <div />
          <div className="text-[11px] italic opacity-40">
            {pNum(currentSpreadPageNumber)}
          </div>
        </div>
      ),
      right: (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={() => {
              setEditorInitialTab("memory");
              setEditingVolume(true);
            }}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>Write Next Memory</span>
          </button>
        </div>
      ),
    };

    return [welcomeSpread, ...memorySpreads, trailingBlank];
  }, [
    arrangingMemoryId,
    book,
    deletingMemoryId,
    draftBlocksByMemory,
    handleChangeAlbumStyle,
    handleBlocksChange,
    handleResetLayout,
    memories,
    openMenuMemoryId,
    renderPhotoCollection,
    savingLayoutId,
    selectedBlockId,
  ]);

  const safeSpreadIndex = Math.max(0, Math.min(spreads.length - 1, activeSpreadIndex));

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
                  {item.isShared ? " · Shared" : ""}
                  {(item.memoryCount ?? 0) > 0 ? ` (${item.memoryCount})` : ""}
                </option>
              ))}
            </select>

            {book.isShared && (
              <span
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
                title={
                  book.sharedBy
                    ? `Co-authored · Created by ${book.sharedBy}`
                    : book.collaboratorEmail
                      ? `Co-authored with ${book.collaboratorEmail}`
                      : "Co-authored Volume"
                }
              >
                <Users className="h-3 w-3" />
                <span>{book.sharedBy ? `From ${book.sharedBy}` : "Shared"}</span>
              </span>
            )}

            {/* Live Presence indicator with Glowing Green Dot */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 shadow-sm"
              title={
                activeViewers.length > 0
                  ? activeViewers.map((v) => `${v.name || v.email} (Active now)`).join(", ")
                  : "You are actively viewing this volume"
              }
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>
                {activeViewers.length > 1
                  ? `${activeViewers.length} Lively Reading`
                  : "Live Now"}
              </span>
            </div>

            <span className="top-dock__divider" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                setEditorInitialTab("collaborate");
                setEditingVolume(true);
              }}
              className="top-dock__btn top-dock__btn--soft"
              aria-label="Share & Co-Author"
              title="Share Book & Copy Invite Link"
            >
              <Share2 className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 820) {
                  alert("Book customization and editing are designed for Desktop Mode. Please switch your mobile browser to 'Desktop Site' or view on a desktop computer.");
                  return;
                }
                setEditorInitialTab("cover");
                setEditingVolume(true);
              }}
              className="top-dock__btn top-dock__btn--primary"
              aria-label="Customize Book & Memories"
              title="Customize Book & Memories"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Customize</span>
            </button>
          </ExpandableDock>

          <ThemeToggle />
        </div>
      </header>

      <main className="diary-container">
        {((storageMode === "server" && offlineDraftCount > 0) || draftNotice) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-full border border-[var(--hairline)] bg-[var(--pill-bg)] px-4 py-2 text-xs text-[var(--ink)] shadow-sm">
            {draftNotice ? (
              <span>{draftNotice}</span>
            ) : (
              <span>
                {offlineDraftCount} offline browser {offlineDraftCount === 1 ? "draft" : "drafts"}{" "}
                found in local cache
              </span>
            )}
            <div className="flex items-center gap-2">
              {storageMode === "server" && offlineDraftCount > 0 && (
                <button
                  type="button"
                  disabled={restoringDrafts}
                  onClick={async () => {
                    setRestoringDrafts(true);
                    setDraftNotice(null);
                    try {
                      const res = await syncOfflineToServer();
                      setDraftNotice(
                        `Restored ${res.addedMemories} memories and ${res.updatedBooks} volume updates to your archive.`,
                      );
                      await loadData(true);
                    } catch (err) {
                      setDraftNotice(
                        err instanceof Error
                          ? err.message
                          : "Could not restore offline drafts right now.",
                      );
                    } finally {
                      setRestoringDrafts(false);
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1 text-[10px] font-semibold tracking-wider text-[var(--paper-light)] uppercase hover:bg-[var(--walnut-deep)] disabled:opacity-50"
                >
                  <UploadCloud className="h-3 w-3" aria-hidden="true" />
                  <span>{restoringDrafts ? "Restoring…" : "Restore to Archive"}</span>
                </button>
              )}
              {draftNotice && (
                <button
                  type="button"
                  onClick={() => setDraftNotice(null)}
                  className="cursor-pointer rounded-full px-2 py-0.5 text-[10px] uppercase opacity-70 hover:opacity-100"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
        <FlipBookReader
          book={book}
          spreads={spreads}
          activeIndex={safeSpreadIndex}
          onChangeIndex={setActiveSpreadIndex}
          activeViewers={activeViewers}
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
              {getMemoryDisplayTitle(lightboxState.memory)} ·{" "}
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
                getMemoryDisplayTitle(lightboxState.memory)
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
        key={`${book.id}-${editingVolume}-${editorInitialTab}`}
        mode="edit"
        book={book}
        shelfBooks={books}
        initialTab={editorInitialTab}
        open={editingVolume}
        onClose={() => setEditingVolume(false)}
        onSave={handleSaveBook}
        onDelete={handleDeleteBook}
        onMemoryCreated={async () => {
          await loadData(true);
        }}
      />

      <MemoryEditorModal
        memory={editingMemory}
        open={Boolean(editingMemory)}
        onClose={() => setEditingMemory(null)}
        onSave={(updated) => {
          setDraftBlocksByMemory((prev) => {
            const next = { ...prev };
            delete next[updated.id];
            return next;
          });
          setMemories((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m)),
          );
        }}
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
