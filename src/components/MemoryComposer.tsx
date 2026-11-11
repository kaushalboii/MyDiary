"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ImagePlus,
  Loader2,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
} from "lucide-react";
import { BookMotifPreview } from "@/components/BookMotifPreview";
import { defaultBooks } from "@/lib/default-books";
import {
  createMemory,
  fetchBooks,
  fetchMemory,
  resolveMediaUrl,
  updateMemory,
  uploadPhotos,
} from "@/lib/storage-client";
import type {
  AlbumPhoto,
  AlbumStyle,
  DiaryBook,
  MemoryMood,
} from "@/lib/types";

const MOODS: MemoryMood[] = [
  "Nostalgic",
  "Joyful",
  "Peaceful",
  "Adventurous",
  "Reflective",
  "Grateful",
];

const ALBUM_STYLES: Array<{
  id: AlbumStyle;
  name: string;
  desc: string;
}> = [
  {
    id: "polaroid",
    name: "Archival Polaroid",
    desc: "Tactile tilted frames with cream borders & serif captions",
  },
  {
    id: "grid",
    name: "Editorial Grid",
    desc: "Clean gallery layout with featured hero framing",
  },
  {
    id: "filmstrip",
    name: "Contact Sheet",
    desc: "Darkroom film-strip frames with numbered margins",
  },
];

export function MemoryComposer({
  initialBookId,
  editMemoryId,
}: {
  initialBookId?: string;
  editMemoryId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [books, setBooks] = useState<DiaryBook[]>(defaultBooks);

  const [bookId, setBookId] = useState(
    initialBookId || defaultBooks[0]?.id || "memories-2022",
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [mood, setMood] = useState<string>("Nostalgic");
  const [note, setNote] = useState("");
  const [paragraphsText, setParagraphsText] = useState("");
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [albumStyle, setAlbumStyle] = useState<AlbumStyle>("polaroid");

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editMemoryId));
  const [editMissing, setEditMissing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    const res = await fetchBooks();
    setBooks(res.books);
    setBookId((prev) =>
      res.books.some((b) => b.id === prev) ? prev : res.books[0]?.id || prev,
    );
  }, []);

  useEffect(() => {
    void loadBooks();
    const handler = () => void loadBooks();
    window.addEventListener("mydiary:storage-config-changed", handler);
    return () => {
      window.removeEventListener("mydiary:storage-config-changed", handler);
    };
  }, [loadBooks]);

  useEffect(() => {
    if (!editMemoryId) {
      setLoadingExisting(false);
      setEditMissing(false);
      return;
    }
    let cancelled = false;
    setLoadingExisting(true);
    setEditMissing(false);
    void fetchMemory(editMemoryId)
      .then((res) => {
        if (cancelled) return;
        if (!res.memory) {
          setEditMissing(true);
          return;
        }
        const m = res.memory;
        setBookId(m.bookId);
        setTitle(m.title);
        setDate(m.date);
        setLocation(m.location);
        setMood(m.mood);
        setNote(m.note);
        setParagraphsText(m.paragraphs.join("\n\n"));
        setPhotos(m.photos);
        setCoverPhotoId(m.coverPhotoId);
        setAlbumStyle(m.albumStyle);
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editMemoryId]);

  const activeBook = useMemo(
    () => books.find((b) => b.id === bookId) || books[0],
    [books, bookId],
  );

  const parsedParagraphs = useMemo(
    () =>
      paragraphsText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    [paragraphsText],
  );

  const wordCount = useMemo(() => {
    const combined = `${note} ${paragraphsText}`.trim();
    return combined ? combined.split(/\s+/).length : 0;
  }, [note, paragraphsText]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const imageFiles = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f.name),
    );
    if (imageFiles.length === 0) {
      setError("Please select image files (JPG, PNG, WebP, GIF).");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const res = await uploadPhotos(imageFiles);
      setPhotos((prev) => {
        const next = [...prev, ...res.files];
        if (!coverPhotoId && next[0]) setCoverPhotoId(next[0].id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function updateCaption(photoId: string, caption: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p)),
    );
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removePhoto(photoId: string) {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      if (coverPhotoId === photoId) {
        setCoverPhotoId(next[0]?.id || null);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give this memory a title before binding it into your album.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const payload = {
        bookId,
        title: title.trim(),
        date,
        location: location.trim(),
        mood,
        note: note.trim(),
        paragraphs: parsedParagraphs,
        photos,
        coverPhotoId: coverPhotoId || photos[0]?.id || null,
        albumStyle,
      };

      const saved = editMemoryId
        ? await updateMemory(editMemoryId, payload)
        : await createMemory(payload);

      router.push(
        `/book?id=${encodeURIComponent(bookId)}&memory=${encodeURIComponent(saved.memory.id)}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save memory album.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="diary-page">
      <header className="diary-topbar">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/book?id=${encodeURIComponent(bookId)}`}
            className="header-pill-btn"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to {activeBook.shortTitle}</span>
          </Link>
          <Link
            href={`/?book=${encodeURIComponent(bookId)}`}
            className="header-pill-btn"
          >
            <span>3D Shelf</span>
          </Link>
        </div>
      </header>

      <main className="diary-container max-w-5xl">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow m-0 text-[var(--ink-soft)]">
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              <span>
                {editMemoryId ? "Edit Saved Memory Album" : "Memory Composer Studio"}
              </span>
            </p>
            <h1
              className="mt-2 mb-0 text-4xl sm:text-5xl font-normal tracking-tight"
              style={{ fontFamily: "var(--serif)" }}
            >
              {editMemoryId ? "Revise Your Memory" : "Compose a Memory Album"}
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Write a keepsake note, craft your story in paragraphs, upload photographs, and bind everything into{" "}
              <strong className="font-semibold text-[var(--ink)]">
                {activeBook.title}
              </strong>
              .
            </p>
          </div>

          <div className="flex items-center gap-3 border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-3">
            <BookMotifPreview book={activeBook} size="sm" />
            <div>
              <div className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Target Volume
              </div>
              <div className="font-serif text-base">{activeBook.title}</div>
            </div>
          </div>
        </div>

        {loadingExisting ? (
          <div className="stationery-card p-12 text-center font-serif text-lg italic text-[var(--ink-soft)]">
            Loading memory page...
          </div>
        ) : editMissing ? (
          <div className="stationery-card p-12 text-center">
            <h2
              className="m-0 text-2xl font-normal"
              style={{ fontFamily: "var(--serif)" }}
            >
              Memory Entry Not Found
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              This entry could not be loaded from your current storage.
            </p>
            <Link
              href={`/book?id=${encodeURIComponent(activeBook.id)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase no-underline"
            >
              Return to {activeBook.shortTitle}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <section className="stationery-card p-6 sm:p-8">
              <div className="mb-5 flex items-center gap-2 border-b border-[var(--hairline)] pb-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                <BookOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>01 · Volume & Moment Details</span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Store Inside Notebook
                  </label>
                  <select
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm font-medium"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} ({b.subtitle})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Memory Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Memory Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Monsoon Evening Walk by Marine Drive"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3 font-serif text-xl"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Goa, India"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Mood / Atmosphere
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOODS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMood(item)}
                        className={`border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider uppercase cursor-pointer transition ${
                          mood === item
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink)]"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="stationery-card p-6 sm:p-8">
              <div className="mb-5 flex items-center justify-between border-b border-[var(--hairline)] pb-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                  <StickyNote className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>02 · Write a Note</span>
                </div>
                <span className="text-[10px] text-[var(--ink-soft)]">
                  Pinned keepsake summary or quote
                </span>
              </div>

              <div className="note-slip">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Write a quick note, a feeling from that day, a line someone said, or a tiny reminder you never want to forget..."
                  className="w-full resize-y border-0 bg-transparent p-0 font-serif text-lg italic leading-relaxed focus:outline-none"
                />
              </div>
            </section>

            <section className="stationery-card p-6 sm:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3">
                <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                  03 · Write Paragraphs
                </div>
                <div className="flex items-center gap-4 text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  <span>
                    {parsedParagraphs.length}{" "}
                    {parsedParagraphs.length === 1 ? "Paragraph" : "Paragraphs"}
                  </span>
                  <span>{wordCount} Words</span>
                </div>
              </div>

              <textarea
                rows={9}
                value={paragraphsText}
                onChange={(e) => setParagraphsText(e.target.value)}
                placeholder="Tell the full story here in your own words. Leave a blank line between paragraphs to format them cleanly inside your diary spread..."
                className="w-full resize-y border border-[var(--hairline)] bg-[var(--paper)] p-5 font-serif text-lg leading-[1.7] text-[#2a2722]"
              />
              <p className="mt-2 mb-0 text-xs text-[var(--ink-soft)]">
                Tip: Separate paragraphs with a blank line (`Enter` twice) for editorial book typesetting.
              </p>
            </section>

            <section className="stationery-card p-6 sm:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)]">
                  <ImagePlus className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>04 · Upload Images & Create Album</span>
                </div>
                <span className="text-[10px] text-[var(--ink-soft)]">
                  {photos.length}{" "}
                  {photos.length === 1 ? "photograph" : "photographs"} attached
                </span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex flex-col items-center justify-center border-2 border-dashed p-8 text-center cursor-pointer transition ${
                  dragOver
                    ? "border-[var(--accent)] bg-[#f9f4eb]"
                    : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
                    <p className="mt-3 mb-0 font-serif text-lg">
                      Adding photographs...
                    </p>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-7 w-7 text-[var(--accent)]" />
                    <p className="mt-3 mb-1 font-serif text-xl">
                      Drop photographs here, or click to browse
                    </p>
                    <p className="m-0 text-xs text-[var(--ink-soft)]">
                      Upload multiple photos at once to include in your memory album.
                    </p>
                  </>
                )}
              </div>

              {photos.length > 0 && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {photos.map((photo, idx) => {
                    const isCover = coverPhotoId === photo.id;
                    return (
                      <div
                        key={photo.id}
                        className="border border-[var(--hairline)] bg-[var(--paper)] p-3"
                      >
                        <div className="relative overflow-hidden bg-[var(--paper-deep)]">
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt={photo.caption || photo.originalName}
                            className="aspect-[4/3] w-full object-cover"
                          />
                          {isCover && (
                            <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-[var(--ink)] px-2 py-0.5 text-[9px] font-semibold tracking-wider text-[var(--paper-light)] uppercase">
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Cover
                            </span>
                          )}
                        </div>

                        <input
                          type="text"
                          value={photo.caption}
                          onChange={(e) => updateCaption(photo.id, e.target.value)}
                          placeholder="Add photo caption..."
                          className="mt-2.5 w-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1.5 font-serif text-sm italic"
                        />

                        <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setCoverPhotoId(photo.id)}
                            className={`inline-flex items-center gap-1 border px-2 py-1 uppercase tracking-wider cursor-pointer ${
                              isCover
                                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                                : "border-[var(--hairline)] bg-[var(--paper-light)]"
                            }`}
                          >
                            <Star className="h-2.5 w-2.5" />
                            <span>{isCover ? "Cover" : "Set Cover"}</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => movePhoto(idx, -1)}
                              aria-label="Move photo up"
                              className="border border-[var(--hairline)] bg-[var(--paper-light)] p-1 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === photos.length - 1}
                              onClick={() => movePhoto(idx, 1)}
                              aria-label="Move photo down"
                              className="border border-[var(--hairline)] bg-[var(--paper-light)] p-1 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePhoto(photo.id)}
                              aria-label="Remove photo"
                              className="border border-[var(--hairline)] bg-[var(--paper-light)] p-1 text-[var(--accent)] cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-7 border-t border-[var(--hairline)] pt-5">
                <label className="mb-2.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Album Presentation Style
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ALBUM_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setAlbumStyle(style.id)}
                      className={`border p-3.5 text-left cursor-pointer transition ${
                        albumStyle === style.id
                          ? "border-[var(--ink)] bg-[var(--paper-deep)]"
                          : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-base font-medium">
                          {style.name}
                        </span>
                        {albumStyle === style.id && (
                          <Check className="h-4 w-4 text-[var(--accent)]" />
                        )}
                      </div>
                      <p className="mt-1 mb-0 text-xs text-[var(--ink-soft)]">
                        {style.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {error && (
              <div className="border border-[var(--accent)] bg-[#fdf3f0] px-4 py-3 text-sm text-[var(--accent)]">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--hairline)] pt-6">
              <Link
                href={`/book?id=${encodeURIComponent(bookId)}`}
                className="rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-5 py-3 text-xs font-semibold tracking-widest uppercase no-underline hover:border-[var(--ink)]"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving || uploading}
                className="inline-flex items-center gap-2.5 rounded-full bg-[var(--ink)] px-7 py-3.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)] disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Binding Memory Album...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>
                      {editMemoryId
                        ? "Update Memory Album"
                        : `Bind as Album in ${activeBook.shortTitle}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

