"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { resolveMediaUrl, updateMemory, uploadPhotos } from "@/lib/storage-client";
import type { AlbumPhoto, AlbumStyle, MemoryAlbum, MemoryMood } from "@/lib/types";

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
    id: "borderless",
    name: "Frameless Grid",
    desc: "Clean borderless photos with no outer frame or card padding",
  },
  {
    id: "polaroid",
    name: "Archival Polaroid",
    desc: "Tactile tilted frames with cream borders & serif captions",
  },
  {
    id: "portrait",
    name: "Wedding Album",
    desc: "Border-free fine art portraits & luxury multi-photo spreads",
  },
];

export function MemoryEditorModal({
  memory,
  open,
  onClose,
  onSave,
}: {
  memory: MemoryAlbum | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: MemoryAlbum) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"words" | "photos">("words");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [mood, setMood] = useState<MemoryMood>("Nostalgic");
  const [note, setNote] = useState("");
  const [paragraphsText, setParagraphsText] = useState("");
  const [albumStyle, setAlbumStyle] = useState<AlbumStyle>("portrait");
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state whenever a new memory is opened
  useEffect(() => {
    if (memory) {
      setTitle(
        memory.title?.trim() && memory.title.trim() !== "Encrypted Entry"
          ? memory.title
          : "First",
      );
      setDate(memory.date || new Date().toISOString().slice(0, 10));
      setLocation(memory.location || "");
      setMood((memory.mood as MemoryMood) || "Nostalgic");
      setNote(memory.note || "");
      setParagraphsText(memory.paragraphs?.join("\n\n") || "");
      setAlbumStyle(memory.albumStyle || "portrait");
      setPhotos(memory.photos || []);
      setError(null);
    }
  }, [memory]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open || !memory) return null;

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPhotos(Array.from(files), memory?.bookId);
      setPhotos((prev) => [...prev, ...res.files]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photos.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemovePhoto(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  function handlePhotoCaptionChange(photoId: string, caption: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p)),
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!memory) return;

    setSaving(true);
    setError(null);

    const parsedParagraphs = paragraphsText
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      const photoCountChanged = (memory.photos?.length || 0) !== photos.length;
      const styleChanged = memory.albumStyle !== albumStyle;
      const shouldResetLayout = photoCountChanged || styleChanged;
      const res = await updateMemory(memory.id, {
        title: title.trim(),
        date,
        location: location.trim(),
        mood,
        note: note.trim(),
        paragraphs: parsedParagraphs,
        albumStyle,
        photos,
        coverPhotoId: photos[0]?.id || null,
        layoutBlocks: shouldResetLayout ? [] : memory.layoutBlocks,
      });

      onSave(res.memory);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update memory.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="stationery-card my-auto flex w-full max-w-2xl max-h-[92dvh] flex-col p-6 sm:p-7 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>In-Book Memory Editor</span>
            </div>
            <h2 className="m-0 mt-1 font-serif text-2xl text-[var(--ink)]">
              {title.trim() ? title : "Edit Memory Entry"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hairline)] text-[var(--ink-soft)] hover:bg-[var(--paper-deep)] hover:text-[var(--ink)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 flex border-b border-[var(--hairline)] text-xs font-semibold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setActiveTab("words")}
            className={`border-b-2 px-4 py-2.5 transition cursor-pointer ${
              activeTab === "words"
                ? "border-[var(--ink)] text-[var(--ink)] font-bold"
                : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            Words & Keepsake
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("photos")}
            className={`border-b-2 px-4 py-2.5 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "photos"
                ? "border-[var(--ink)] text-[var(--ink)] font-bold"
                : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <span>Presentation & Photos</span>
            {photos.length > 0 && (
              <span className="rounded-full bg-[var(--paper-deep)] px-1.5 py-0.2 text-[10px]">
                {photos.length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-y-auto pt-4 pr-1">
          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {activeTab === "words" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Entry Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Summer in Provence"
                  className="mt-1.5 w-full rounded border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Date
                  </label>
                  <div className="relative mt-1.5">
                    <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--ink-soft)]" />
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded border border-[var(--hairline)] bg-[var(--paper)] py-2 pr-3 pl-9 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Location
                  </label>
                  <div className="relative mt-1.5">
                    <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--ink-soft)]" />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g., Kyoto, Japan"
                      className="w-full rounded border border-[var(--hairline)] bg-[var(--paper)] py-2 pr-3 pl-9 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Atmospheric Mood
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MOODS.map((m) => {
                    const isSelected = mood === m;
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => setMood(m)}
                        className={`rounded-full px-3.5 py-1 text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? "bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border border-[var(--hairline)] bg-[var(--paper)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Keepsake Note (Highlighted Callout)
                </label>
                <div className="relative mt-1.5">
                  <StickyNote className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--ink-soft)]" />
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="A memorable line or quote from this day..."
                    className="w-full rounded border border-[var(--hairline)] bg-[var(--paper)] py-2 pr-3 pl-9 text-sm italic text-[var(--ink)] focus:border-[var(--ink)] focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Journal Story / Paragraphs
                </label>
                <textarea
                  rows={5}
                  value={paragraphsText}
                  onChange={(e) => setParagraphsText(e.target.value)}
                  placeholder="Write the full memory story. Separate paragraphs with double enter..."
                  className="mt-1.5 w-full rounded border border-[var(--hairline)] bg-[var(--paper)] p-3 text-sm leading-relaxed text-[var(--ink)] focus:border-[var(--ink)] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {activeTab === "photos" && (
            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)] mb-2">
                  Photo Album Presentation Style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ALBUM_STYLES.map((style) => {
                    const isSelected = albumStyle === style.id;
                    return (
                      <button
                        type="button"
                        key={style.id}
                        onClick={() => setAlbumStyle(style.id)}
                        className={`text-left p-3 rounded-lg border transition cursor-pointer ${
                          isSelected
                            ? "border-[var(--ink)] bg-[var(--paper-deep)] ring-1 ring-[var(--ink)]"
                            : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink-soft)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-serif text-sm font-semibold text-[var(--ink)]">
                            {style.name}
                          </span>
                          {isSelected && <Check className="h-4 w-4 text-[var(--accent)]" />}
                        </div>
                        <p className="mt-1 text-xs text-[var(--ink-soft)] leading-snug">
                          {style.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Photographs ({photos.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 text-[11px] font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)] disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3 w-3" />
                    )}
                    <span>{uploading ? "Uploading..." : "+ Add Photos"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handlePhotoUpload(e.target.files)}
                  />
                </div>

                {photos.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--hairline)] p-8 text-center cursor-pointer hover:border-[var(--ink-soft)] bg-[var(--paper)]/50"
                  >
                    <ImagePlus className="h-8 w-8 text-[var(--ink-soft)] opacity-60 mb-2" />
                    <p className="text-xs font-semibold text-[var(--ink)]">
                      No photographs in this memory yet
                    </p>
                    <p className="text-[11px] text-[var(--ink-soft)] mt-0.5">
                      Click to upload photos directly from your device
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                    {photos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        className="group relative flex gap-2.5 rounded-md border border-[var(--hairline)] bg-[var(--paper)] p-2"
                      >
                        <img
                          src={resolveMediaUrl(photo.url)}
                          alt={photo.caption || `Photo ${idx + 1}`}
                          className="h-16 w-16 rounded object-cover shrink-0 bg-black/10"
                        />
                        <div className="flex flex-1 flex-col justify-between overflow-hidden">
                          <input
                            type="text"
                            value={photo.caption || ""}
                            onChange={(e) =>
                              handlePhotoCaptionChange(photo.id, e.target.value)
                            }
                            placeholder="Add photo caption..."
                            className="w-full rounded border border-[var(--hairline)]/70 bg-transparent px-2 py-1 text-xs text-[var(--ink)] placeholder:text-[var(--ink-soft)]/50 focus:border-[var(--ink)] focus:outline-hidden"
                          />
                          <div className="flex items-center justify-between text-[10px] text-[var(--ink-soft)] mt-1">
                            <span>Frame #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(photo.id)}
                              className="text-red-500 hover:text-red-700 cursor-pointer p-0.5"
                              title="Delete photo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--hairline)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)] bg-[var(--ink)] px-6 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase transition hover:bg-[var(--walnut-deep)] cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>{saving ? "Updating..." : "Update Memory"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
