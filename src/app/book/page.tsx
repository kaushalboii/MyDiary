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
  LayoutGrid,
  MapPin,
  PenLine,
  RotateCcw,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { ExpandableDock } from "@/components/ExpandableDock";
import { FlipBookReader, type BookSpread } from "@/components/FlipBookReader";
import { FreeformPageSurface } from "@/components/FreeformPageBlocks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VolumeEditorModal } from "@/components/VolumeEditorModal";
import { defaultBooks } from "@/lib/default-books";
import {
  buildDefaultLayoutBlocks,
  formatBookPageNumber,
  getMemoryDisplayTitle,
  getPageAccentColor,
  isImagesOnlyMemory,
  syncLayoutBlocksWithMemory,
} from "@/lib/memory-layout";
import {
  AUTH_REQUIRED_EVENT,
  deleteBook,
  deleteMemory,
  fetchBooks,
  fetchMemories,
  getOfflineDraftCount,
  isStorageAuthError,
  isUserAuthenticated,
  loadCachedServerBooks,
  resolveMediaUrl,
  syncOfflineToServer,
  updateBook,
  updateMemory,
  type BookPatchInput,
} from "@/lib/storage-client";
import type {
  AlbumPhoto,
  DiaryBook,
  MemoryAlbum,
  MemoryLayoutBlock,
  StorageMode,
} from "@/lib/types";

const POLAROID_TILTS = ["-1.4deg", "1.1deg", "-0.8deg", "1.5deg", "-1.1deg", "0.7deg"];

function BookMemoriesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedBookId = params.get("id") || "";
  const requestedMemoryId = params.get("memory") || "";

  const [books, setBooks] = useState<DiaryBook[]>(() => loadCachedServerBooks() || defaultBooks);
  const [memories, setMemories] = useState<MemoryAlbum[]>([]);
  const [storageMode, setStorageMode] = useState<StorageMode>("offline-fallback");
  const [offlineDraftCount, setOfflineDraftCount] = useState(0);
  const [restoringDrafts, setRestoringDrafts] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [editingVolume, setEditingVolume] = useState(false);
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const [arrangingMemoryId, setArrangingMemoryId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draftBlocksByMemory, setDraftBlocksByMemory] = useState<
    Record<string, MemoryLayoutBlock[]>
  >({});
  const [savingLayoutId, setSavingLayoutId] = useState<string | null>(null);
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
        const authenticated = isUserAuthenticated();
        const [booksRes, initialMemRes] = await Promise.all([
          fetchBooks(),
          authenticated && requestedBookId
            ? fetchMemories({ bookId: requestedBookId })
            : Promise.resolve({ memories: [], mode: "offline-fallback" as const }),
        ]);
        setBooks(booksRes.books);
        setStorageMode(booksRes.mode);
        const targetId =
          requestedBookId && booksRes.books.some((b) => b.id === requestedBookId)
            ? requestedBookId
            : booksRes.books[0]?.id || "memories-2022";

        const [memRes, draftCount] = await Promise.all([
          authenticated
            ? (initialMemRes && targetId === requestedBookId
                ? Promise.resolve(initialMemRes)
                : fetchMemories({ bookId: targetId }))
            : Promise.resolve({ memories: [], mode: "offline-fallback" as const }),
          authenticated ? getOfflineDraftCount() : Promise.resolve(0),
        ]);
        setMemories(memRes.memories);
        setOfflineDraftCount(draftCount);

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

  const renderPhotoCollection = useCallback(
    (mem: MemoryAlbum, photoItems: { photo: AlbumPhoto; idx: number }[]) => {
      if (mem.albumStyle === "filmstrip") {
        return (
          <div className="space-y-3.5">
            {photoItems.map(({ photo, idx }) => (
              <div key={photo.id} className="filmstrip-frame">
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block w-full overflow-hidden bg-black cursor-pointer"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Album frame ${idx + 1}`}
                    className="max-h-60 w-full object-contain transition duration-300 hover:scale-[1.02]"
                  />
                </button>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#dfd7c7]">
                  <span className="font-mono text-[10px] uppercase text-[#b5aa97]">
                    #{String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="italic">{photo.caption || photo.originalName}</span>
                </div>
              </div>
            ))}
          </div>
        );
      }
      if (mem.albumStyle === "grid") {
        return (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {photoItems.map(({ photo, idx }) => (
              <figure
                key={photo.id}
                className={`m-0 border border-[var(--hairline)] bg-[var(--paper-light)] p-2 ${
                  photoItems.length === 1 || (idx === 0 && photoItems.length % 2 === 1)
                    ? "sm:col-span-2"
                    : ""
                }`}
              >
                <button
                  type="button"
                  data-no-flip="true"
                  onClick={() => setLightboxState({ memory: mem, index: idx })}
                  className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.caption || `Photo ${idx + 1}`}
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
        );
      }
      return (
        <div
          className={`grid gap-5 ${
            photoItems.length === 1 ? "max-w-xs mx-auto" : "sm:grid-cols-2"
          }`}
        >
          {photoItems.map(({ photo, idx }) => (
            <figure
              key={photo.id}
              className="polaroid-frame m-0"
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
                  className="aspect-square w-full object-cover"
                />
              </button>
              <figcaption className="mt-2.5 px-1 text-center text-xs italic text-[var(--page-ink-muted)]">
                {photo.caption || `${mem.date} · Frame ${idx + 1}`}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    },
    [],
  );

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
                      onClick={() => setActiveSpreadIndex(idx + 1)}
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
                {!isUserAuthenticated() ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent(AUTH_REQUIRED_EVENT, {
                          detail: { message: "Sign in to unlock your private memory volume." },
                        }),
                      );
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-[11px] font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
                  >
                    <span>Sign In to Unlock Volume</span>
                  </button>
                ) : (
                  <Link
                    href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-5 py-2.5 text-[11px] font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    <span>Write First Entry</span>
                  </Link>
                )}
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
                className="not-italic text-[10px] font-semibold tracking-wider uppercase opacity-80 no-underline hover:underline"
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

    const memorySpreads: BookSpread[] = memories.map((mem, idx) => {
      const leftN = (idx + 1) * 2 + 1;
      const rightN = (idx + 1) * 2 + 2;
      const pageLeftStr = pNum(leftN);
      const pageRightStr = pNum(rightN);
      const displayTitle = getMemoryDisplayTitle(mem);
      const isArranging = arrangingMemoryId === mem.id;
      const hasCustomLayout = Boolean(mem.layoutBlocks && mem.layoutBlocks.length > 0);
      const activeBlocks =
        draftBlocksByMemory[mem.id] ||
        (hasCustomLayout || isArranging ? syncLayoutBlocksWithMemory(mem) : null);

      const spreadToolbarFooterLeft = !isUserAuthenticated() ? null : (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3 text-xs text-[var(--ink-soft)]">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(mem.id)}`}
              className="inline-flex items-center gap-1 font-semibold tracking-wider uppercase text-[var(--ink)] no-underline hover:underline"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Link>
            <button
              type="button"
              data-no-flip="true"
              data-testid={`arrange-memory-${mem.id}`}
              onClick={() => {
                if (isArranging) {
                  setArrangingMemoryId(null);
                  setSelectedBlockId(null);
                } else {
                  setDraftBlocksByMemory((prev) => ({
                    ...prev,
                    [mem.id]:
                      prev[mem.id] ||
                      (mem.layoutBlocks?.length
                        ? syncLayoutBlocksWithMemory(mem)
                        : buildDefaultLayoutBlocks(mem)),
                  }));
                  setArrangingMemoryId(mem.id);
                }
              }}
              className={`inline-flex items-center gap-1 font-semibold tracking-wider uppercase cursor-pointer hover:underline ${
                isArranging ? "text-[var(--accent)]" : "text-[var(--ink)]"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>{isArranging ? "Done" : "Arrange"}</span>
            </button>
            {(isArranging || hasCustomLayout) && (
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
            )}
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
          <span className="italic">
            {savingLayoutId === mem.id ? "Saving…" : pageLeftStr}
          </span>
        </div>
      );

      if (activeBlocks) {
        return {
          id: mem.id,
          label: `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`,
          left: (
            <div className="flex flex-1 flex-col justify-between gap-3">
              {isArranging && (
                <div
                  data-no-flip="true"
                  className="flex items-center justify-between rounded border border-[var(--hairline)] bg-[var(--paper)]/90 px-2.5 py-1 text-[10px] tracking-wider uppercase text-[var(--ink-soft)]"
                >
                  <span>Drag any item to place anywhere on Left or Right page</span>
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
              {spreadToolbarFooterLeft}
            </div>
          ),
          right: (
            <div className="flex flex-1 flex-col justify-between gap-3">
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
        };
      }

      const imagesOnly = isImagesOnlyMemory(mem);
      if (imagesOnly) {
        const indexed = mem.photos.map((photo, pIdx) => ({ photo, idx: pIdx }));
        const splitAt = Math.ceil(indexed.length / 2);
        const leftPhotos = indexed.length > 1 ? indexed.slice(0, splitAt) : indexed;
        const rightPhotos = indexed.length > 1 ? indexed.slice(splitAt) : [];

        return {
          id: mem.id,
          label: `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`,
          left: (
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2.5 text-[10px] font-semibold tracking-[0.15em] uppercase text-[var(--ink-soft)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {mem.date}
                    {mem.location ? ` · ${mem.location}` : ""}
                  </span>
                  <span style={{ color: pageAccent }}>{mem.mood}</span>
                </div>
                {renderPhotoCollection(mem, leftPhotos)}
              </div>
              {spreadToolbarFooterLeft}
            </div>
          ),
          right: (
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <div className="mb-5 flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Images className="h-3.5 w-3.5" style={{ color: pageAccent }} />
                    {mem.photos.length} {mem.photos.length === 1 ? "Photograph" : "Photographs"}
                  </span>
                  <span>
                    {mem.albumStyle === "filmstrip"
                      ? "Contact Sheet"
                      : mem.albumStyle === "grid"
                        ? "Editorial Grid"
                        : "Polaroids"}
                  </span>
                </div>
                {rightPhotos.length > 0 ? (
                  renderPhotoCollection(mem, rightPhotos)
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center text-center opacity-55">
                    <div
                      className="h-2 w-2 rotate-45"
                      style={{ backgroundColor: pageAccent }}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
              <div className="mt-8 border-t border-[var(--hairline)] pt-3.5 text-right text-xs italic text-[var(--ink-soft)]">
                {pageRightStr}
              </div>
            </div>
          ),
        };
      }

      const indexedRightPhotos = mem.photos.map((photo, pIdx) => ({ photo, idx: pIdx }));

      return {
        id: mem.id,
        label: `${displayTitle} · pp. ${String(leftN).padStart(2, "0")}–${String(rightN).padStart(2, "0")}`,
        left: (
          <div className="flex flex-1 flex-col justify-between">
            <div>
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
                <span
                  className="ml-auto rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-0.5"
                  style={{ color: pageAccent }}
                >
                  {mem.mood}
                </span>
              </div>

              {mem.title?.trim() && (
                <h2
                  className={`mt-5 mb-0 text-3xl sm:text-4xl font-normal tracking-tight leading-[1.05] text-[var(--page-ink)] ${
                    headerStyle === "centered" ? "text-center" : ""
                  }`}
                >
                  {mem.title}
                </h2>
              )}

              {mem.note && (
                <div className="note-slip mt-6" style={{ borderLeftColor: pageAccent }}>
                  <div
                    className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase"
                    style={{ color: pageAccent }}
                  >
                    <StickyNote className="h-3 w-3" />
                    <span>Keepsake Note</span>
                  </div>
                  <p className="m-0 text-base italic leading-relaxed text-[var(--page-ink)]">
                    “{mem.note}”
                  </p>
                </div>
              )}

              {mem.paragraphs.length > 0 && (
                <div className="mt-6 space-y-4 text-[16px] leading-[1.7] text-[var(--page-ink-muted)]">
                  {mem.paragraphs.map((paragraph, pIdx) => (
                    <p key={pIdx} className="m-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {spreadToolbarFooterLeft}
          </div>
        ),
        right: (
          <div className="flex flex-1 flex-col justify-between">
            {indexedRightPhotos.length > 0 ? (
              <div>
                <div className="mb-5 flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Images className="h-3.5 w-3.5" style={{ color: pageAccent }} />
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
                {renderPhotoCollection(mem, indexedRightPhotos)}
              </div>
            ) : (
              <div className="my-auto flex flex-col items-center justify-center py-10 text-center opacity-55">
                <div
                  className="h-2 w-2 rotate-45"
                  style={{ backgroundColor: pageAccent }}
                  aria-hidden="true"
                />
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}&edit=${encodeURIComponent(mem.id)}`}
                  className="mt-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--ink-soft)] no-underline hover:text-[var(--ink)] hover:underline"
                >
                  + Add photographs (optional)
                </Link>
              </div>
            )}

            <div className="mt-8 border-t border-[var(--hairline)] pt-3.5 text-right text-xs italic text-[var(--ink-soft)]">
              {pageRightStr}
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
            {pNum((memories.length + 1) * 2 + 1)}
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
  }, [
    arrangingMemoryId,
    book,
    deletingMemoryId,
    draftBlocksByMemory,
    handleBlocksChange,
    handleResetLayout,
    memories,
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
                  {(item.memoryCount ?? 0) > 0 ? ` (${item.memoryCount})` : ""}
                </option>
              ))}
            </select>

            {isUserAuthenticated() && (
              <>
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
              </>
            )}
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
