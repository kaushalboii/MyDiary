"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Feather,
  Images,
  MapPin,
  PenLine,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { BookMotifPreview } from "@/components/BookMotifPreview";
import { StorageStatusPill } from "@/components/StorageStatusPill";
import { VolumeEditorModal } from "@/components/VolumeEditorModal";
import { defaultBooks } from "@/lib/default-books";
import {
  fetchBooks,
  fetchMemories,
  resolveMediaUrl,
  updateBook,
} from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum, StorageMode } from "@/lib/types";

const MOODS = [
  "All",
  "Nostalgic",
  "Joyful",
  "Peaceful",
  "Adventurous",
  "Reflective",
  "Grateful",
];

function BookMemoriesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bookId = params.get("id") || "memories-2022";

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);
  const [memories, setMemories] = useState<MemoryAlbum[]>([]);
  const [storageMode, setStorageMode] = useState<StorageMode>("server");
  const [hostname, setHostname] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mood, setMood] = useState("All");
  const [editingVolume, setEditingVolume] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [booksRes, memRes] = await Promise.all([
        fetchBooks(),
        fetchMemories({ bookId }),
      ]);
      setBooks(booksRes.books);
      setStorageMode(booksRes.mode);
      setHostname(booksRes.hostname);
      setMemories(memRes.memories);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadData();
    const handler = () => void loadData();
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [loadData]);

  const book = useMemo(
    () => books.find((b) => b.id === bookId) || books[0],
    [books, bookId],
  );

  const filteredMemories = useMemo(() => {
    return memories.filter((item) => {
      if (mood !== "All" && item.mood !== mood) return false;
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      return [
        item.title,
        item.note,
        item.location,
        item.mood,
        ...item.paragraphs,
        ...item.photos.map((p) => p.caption),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [memories, mood, search]);

  const totalPhotos = useMemo(
    () => memories.reduce((sum, m) => sum + m.photos.length, 0),
    [memories],
  );

  async function handleSaveBook(patch: Partial<DiaryBook>) {
    const { book: updated, mode } = await updateBook(book.id, patch);
    setStorageMode(mode);
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  return (
    <div className="diary-page">
      <header className="diary-topbar">
        <div className="flex items-center gap-3">
          <Link
            href={`/?book=${encodeURIComponent(book.id)}`}
            className="header-pill-btn"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to 3D Shelf</span>
          </Link>

          <select
            aria-label="Switch diary volume"
            value={book.id}
            onChange={(e) =>
              router.push(`/book?id=${encodeURIComponent(e.target.value)}`)
            }
            className="hidden sm:block border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-xs font-medium"
          >
            {books.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.memoryCount ?? 0})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <StorageStatusPill
            mode={storageMode}
            hostname={hostname}
            onConfigUpdated={() => void loadData()}
          />
          <Link
            href={`/compose?bookId=${encodeURIComponent(book.id)}`}
            className="header-pill-btn header-pill-btn--primary"
          >
            <PenLine className="h-3.5 w-3.5" />
            <span>Write New Memory</span>
          </Link>
        </div>
      </header>

      <main className="diary-container">
        {/* Book Hero Folio */}
        <section className="stationery-card p-6 sm:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-center">
            <BookMotifPreview book={book} size="lg" />

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow m-0 text-[var(--ink-soft)]">
                  <span>{book.yearLabel} Volume</span>
                  <span className="eyebrow__line" />
                  <span>
                    {memories.length}{" "}
                    {memories.length === 1 ? "Memory Album" : "Memory Albums"} ·{" "}
                    {totalPhotos}{" "}
                    {totalPhotos === 1 ? "Photograph" : "Photographs"}
                  </span>
                </p>

                <button
                  type="button"
                  onClick={() => setEditingVolume(true)}
                  className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper)] px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Edit Cover</span>
                </button>
              </div>

              <h1
                className="mt-3 mb-0 text-4xl sm:text-5xl font-normal tracking-tight"
                style={{ fontFamily: "var(--serif)" }}
              >
                {book.title}
              </h1>
              <p
                className="mt-1.5 text-lg italic text-[var(--ink-soft)]"
                style={{ fontFamily: "var(--serif)" }}
              >
                {book.subtitle}
              </p>
              <p
                className="mt-4 max-w-2xl text-base leading-relaxed text-[#36322c]"
                style={{ fontFamily: "var(--serif)" }}
              >
                {book.description}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                  className="inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span>Add Note, Paragraphs & Photos</span>
                </Link>
                <span
                  className="text-xs italic text-[var(--ink-soft)]"
                  style={{ fontFamily: "var(--serif)" }}
                >
                  “{book.quote}”
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Search & Mood Filter */}
        <section className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-soft)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search inside ${book.shortTitle}...`}
              className="w-full border border-[var(--hairline)] bg-[var(--paper-light)] py-2 pr-3 pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMood(item)}
                className={`border px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase cursor-pointer transition ${
                  mood === item
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                    : "border-[var(--hairline)] bg-[var(--paper-light)] hover:border-[var(--ink)]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* Memories List */}
        <section className="mt-8">
          {loading ? (
            <div className="stationery-card p-12 text-center font-serif text-lg italic text-[var(--ink-soft)]">
              Turning the pages of {book.title}...
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="stationery-card flex flex-col items-center justify-center p-12 text-center">
              <Feather className="h-8 w-8 text-[var(--accent)] opacity-80" />
              <h2
                className="mt-4 mb-2 text-3xl font-normal"
                style={{ fontFamily: "var(--serif)" }}
              >
                {memories.length === 0
                  ? `Your ${book.title} pages are blank`
                  : "No matching memories found"}
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-[var(--ink-soft)]">
                {memories.length === 0
                  ? `Open a fresh composer page to write a quick note, craft paragraphs about a day, upload photographs, and bind them together as a keepsake album inside ${book.title}.`
                  : "Try clearing your search or switching mood filters."}
              </p>
              {memories.length === 0 && (
                <Link
                  href={`/compose?bookId=${encodeURIComponent(book.id)}`}
                  className="mt-6 inline-flex items-center gap-2 bg-[var(--ink)] px-6 py-3 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline hover:bg-[var(--walnut-deep)]"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span>Write Your First Memory</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {filteredMemories.map((memory, index) => {
                const coverPhoto =
                  memory.photos.find((p) => p.id === memory.coverPhotoId) ||
                  memory.photos[0];
                const excerpt = memory.paragraphs[0] || "";
                return (
                  <Link
                    key={memory.id}
                    href={`/memory?bookId=${encodeURIComponent(book.id)}&id=${encodeURIComponent(memory.id)}`}
                    className="stationery-card group flex flex-col overflow-hidden no-underline transition hover:-translate-y-0.5 hover:border-[var(--ink)]"
                  >
                    {coverPhoto ? (
                      <div className="relative h-60 w-full overflow-hidden border-b border-[var(--hairline)] bg-[var(--paper-deep)]">
                        <img
                          src={resolveMediaUrl(coverPhoto.url)}
                          alt={coverPhoto.caption || memory.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                        <div className="absolute right-3 bottom-3 flex items-center gap-1.5 border border-black/15 bg-[var(--paper-light)]/92 px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-xs">
                          <Images className="h-3 w-3" />
                          <span>
                            {memory.photos.length}{" "}
                            {memory.photos.length === 1 ? "Photo" : "Photos"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex h-24 items-center justify-between border-b border-[var(--hairline)] px-6"
                        style={{
                          backgroundColor: book.cover,
                          color: book.ink,
                        }}
                      >
                        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase opacity-80">
                          Written Memory · Chapter{" "}
                          {String(filteredMemories.length - index).padStart(2, "0")}
                        </span>
                        <Feather className="h-4 w-4 opacity-75" />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
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
                        <span className="ml-auto border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-[var(--accent)]">
                          {memory.mood}
                        </span>
                      </div>

                      <h2
                        className="mt-3 mb-0 text-2xl font-normal tracking-tight group-hover:text-[var(--accent)] transition-colors"
                        style={{ fontFamily: "var(--serif)" }}
                      >
                        {memory.title}
                      </h2>

                      {memory.note && (
                        <div
                          className="mt-3 border-l-2 border-[var(--accent)] bg-[var(--paper)] px-3.5 py-2.5 text-xs italic text-[#3a342c]"
                          style={{ fontFamily: "var(--serif)" }}
                        >
                          “{memory.note}”
                        </div>
                      )}

                      {excerpt && (
                        <p
                          className="mt-3 mb-0 line-clamp-3 text-sm leading-relaxed text-[var(--ink-soft)]"
                          style={{ fontFamily: "var(--serif)" }}
                        >
                          {excerpt}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between border-t border-[var(--hairline)] pt-4 mt-5 text-[10px] font-semibold tracking-widest uppercase">
                        <span>Open Memory Album</span>
                        <span className="transition-transform group-hover:translate-x-1">
                          →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

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

