"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import {
  resolveMediaUrl,
  uploadPhotos,
  type BookPatchInput,
} from "@/lib/storage-client";
import type {
  BookFontStyle,
  BookMotif,
  CoverTemplate,
  DiaryBook,
  PaperStyle,
  SpineStyle,
} from "@/lib/types";
import { siteConfig } from "@/three/site-config";
import { BookMotifPreview } from "./BookMotifPreview";

const MOTIFS: BookMotif[] = [
  "lattice",
  "corrosion",
  "efficiency",
  "network",
  "boom",
  "organization",
  "schematic",
  "flight",
  "circuit",
  "orbit",
  "branches",
  "wave",
  "runner",
  "gather",
  "maze",
  "fracture",
  "continuum",
  "windows",
  "steps",
];

const CLOTH_PRESETS = [
  { name: "Obsidian Violet", cover: "#06070B", secondary: "#C9D2DC", accent: "#8A6BFF", ink: "#C9D2DC" },
  { name: "Onyx Acid Lime", cover: "#030407", secondary: "#AAB0C4", accent: "#B8F23A", ink: "#AAB0C4" },
  { name: "Ecru Tangerine", cover: "#F3ECE0", secondary: "#D9C3A5", accent: "#F26A1B", ink: "#1E1A16" },
  { name: "Oxblood Volt", cover: "#4A1824", secondary: "#A9A6A1", accent: "#D4FF1A", ink: "#F4EFE9" },
  { name: "Periwinkle Magenta", cover: "#6A8DD6", secondary: "#F0EDE6", accent: "#E5007E", ink: "#F0EDE6" },
  { name: "Prussian Solar", cover: "#07518A", secondary: "#FFF0D5", accent: "#F5E500", ink: "#FFF0D5" },
  { name: "Abyssal Cyan", cover: "#0B1D26", secondary: "#D9E4EC", accent: "#00E5FF", ink: "#EBF3F7" },
  { name: "Matcha Coral", cover: "#214D3A", secondary: "#E6DFCC", accent: "#FF6B4A", ink: "#F6F1E7" },
  { name: "Plum Mint", cover: "#311847", secondary: "#D7CEDE", accent: "#3BFFB0", ink: "#F3EDF7" },
  { name: "Limestone Cobalt", cover: "#EAE4D7", secondary: "#C6B9A3", accent: "#1B5CFF", ink: "#181B22" },
  { name: "Crimson Ice", cover: "#C23B2B", secondary: "#F6ECE0", accent: "#D8FF3D", ink: "#FFF8F2" },
  { name: "Graphite Amber", cover: "#1B1E26", secondary: "#C5CBD6", accent: "#FFB800", ink: "#E9EDF4" },
];

const COVER_TEMPLATES: Array<{ id: CoverTemplate; label: string; hint: string }> = [
  { id: "clean-minimal", label: "Clean Minimal", hint: "Quiet cloth & centered serif" },
  { id: "bordered-plaque", label: "Framed Plaque", hint: "Inset cream label plate" },
  { id: "split-band", label: "Two-Tone Band", hint: "Contrast lower band" },
  { id: "classic", label: "Classic Foil", hint: "Engraved geometric motif" },
  { id: "photo-card", label: "Photo Cover", hint: "Full-bleed custom image" },
];

const SPINE_STYLES: Array<{ id: SpineStyle; label: string }> = [
  { id: "banded", label: "Banded" },
  { id: "classic", label: "Edge Stripe" },
  { id: "bordered", label: "Bordered" },
  { id: "minimal", label: "Clean Cloth" },
];

const PAPER_STYLES: Array<{ id: PaperStyle; label: string; hint: string }> = [
  { id: "cream", label: "Blank Cream", hint: "Pure smooth archival paper" },
  { id: "lined", label: "Ruled Lines", hint: "Soft stationery lines" },
  { id: "dotgrid", label: "Dot Grid", hint: "Discreet 5mm dots" },
  { id: "framed", label: "Framed Border", hint: "Classic journal margin" },
];

const FONT_STYLES: Array<{ id: BookFontStyle; label: string }> = [
  { id: "serif", label: "Editorial Serif" },
  { id: "sans", label: "Clean Sans" },
  { id: "mono", label: "Typewriter" },
];

const SIZE_PRESETS = [
  { name: "Thin Pocket", thickness: 0.125, height: 1.88, width: 1.12 },
  { name: "Slim Everyday", thickness: 0.175, height: 2.02, width: 1.24 },
  { name: "Classic Hardcover", thickness: 0.26, height: 2.16, width: 1.32 },
  { name: "Thick Keepsake", thickness: 0.36, height: 2.24, width: 1.36 },
  { name: "Tall Quarto", thickness: 0.22, height: 2.38, width: 1.32 },
];

type EditorTab = "cover" | "wordings" | "size";

export function VolumeEditorModal({
  mode = "edit",
  book,
  shelfBooks = [],
  defaultInsertIndex,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  mode?: "edit" | "create";
  book: DiaryBook;
  shelfBooks?: DiaryBook[];
  defaultInsertIndex?: number;
  open: boolean;
  onClose: () => void;
  onSave: (patch: BookPatchInput) => Promise<void>;
  onDelete?: (bookId: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const initialSlot =
    mode === "create"
      ? (defaultInsertIndex ?? shelfBooks.length)
      : Math.max(
          0,
          shelfBooks.findIndex((b) => b.id === book.id),
        );

  const [tab, setTab] = useState<EditorTab>(mode === "create" ? "cover" : "cover");

  // Wordings & Inside
  const [title, setTitle] = useState(book.title);
  const [shortTitle, setShortTitle] = useState(book.shortTitle);
  const [syncSpineTitle, setSyncSpineTitle] = useState(book.shortTitle === book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle);
  const [yearLabel, setYearLabel] = useState(book.yearLabel);
  const [coverImprint, setCoverImprint] = useState(
    book.coverImprint ?? siteConfig.coverImprint,
  );
  const [coverFooter, setCoverFooter] = useState(book.coverFooter ?? "");
  const [spineMark, setSpineMark] = useState(
    book.spineMark ?? siteConfig.spineMark,
  );
  const [welcomeNote, setWelcomeNote] = useState(book.welcomeNote ?? "");
  const [description, setDescription] = useState(book.description);
  const [quote, setQuote] = useState(book.quote);
  const [quoteBy, setQuoteBy] = useState(book.quoteBy);

  // Outer Cover Look
  const [cover, setCover] = useState(book.cover);
  const [secondary, setSecondary] = useState(book.secondary || book.accent);
  const [accent, setAccent] = useState(book.accent);
  const [ink, setInk] = useState(book.ink);
  const [motif, setMotif] = useState<BookMotif>(book.motif);
  const [coverTemplate, setCoverTemplate] = useState<CoverTemplate>(
    book.coverTemplate || (book.coverImage ? "photo-card" : "classic"),
  );
  const [spineStyle, setSpineStyle] = useState<SpineStyle>(
    book.spineStyle || "banded",
  );
  const [coverImage, setCoverImage] = useState<string>(book.coverImage || "");
  const [showCoverTextWithImage, setShowCoverTextWithImage] = useState<boolean>(
    book.showCoverTextWithImage ?? true,
  );
  const [living, setLiving] = useState<boolean>(Boolean(book.living));

  // Inside Page & Size / Placement
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(
    book.paperStyle || "cream",
  );
  const [fontStyle, setFontStyle] = useState<BookFontStyle>(
    book.fontStyle || "serif",
  );
  const [height, setHeight] = useState<number>(book.height || 2.12);
  const [thickness, setThickness] = useState<number>(book.thickness || 0.24);
  const [width, setWidth] = useState<number>(book.width || 1.3);
  const [positionIndex, setPositionIndex] = useState<number>(initialSlot);

  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalSlots =
    mode === "create" ? shelfBooks.length + 1 : Math.max(1, shelfBooks.length);

  const previewBook: DiaryBook = {
    ...book,
    title: title || book.title || "Untitled Diary",
    shortTitle: (syncSpineTitle ? title : shortTitle) || book.shortTitle || "Untitled",
    subtitle,
    yearLabel,
    coverImprint,
    coverFooter,
    spineMark,
    welcomeNote,
    description,
    quote,
    quoteBy,
    cover,
    secondary,
    accent,
    ink,
    motif,
    coverTemplate,
    spineStyle,
    coverImage: coverImage || undefined,
    showCoverTextWithImage,
    living,
    paperStyle,
    fontStyle,
    height,
    thickness,
    width,
  };

  async function handleCoverUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    setUploadingCover(true);
    setError(null);
    try {
      const res = await uploadPhotos([file]);
      const uploaded = res.files[0];
      if (uploaded?.url) {
        setCoverImage(uploaded.url);
        if (coverTemplate !== "photo-card" && coverTemplate !== "bordered-plaque") {
          setCoverTemplate("photo-card");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload cover image.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const cleanTitle = title.trim() || "Untitled Diary";
      const cleanSpine = syncSpineTitle
        ? cleanTitle
        : shortTitle.trim() || cleanTitle;
      await onSave({
        title: cleanTitle,
        shortTitle: cleanSpine,
        subtitle: subtitle.trim(),
        yearLabel: yearLabel.trim(),
        coverImprint: coverImprint.trim(),
        coverFooter: coverFooter.trim(),
        spineMark: spineMark.trim(),
        welcomeNote: welcomeNote.trim(),
        description: description.trim(),
        quote: quote.trim(),
        quoteBy: quoteBy.trim(),
        cover,
        secondary,
        accent,
        ink,
        motif,
        coverTemplate,
        spineStyle,
        coverImage: coverImage || "",
        showCoverTextWithImage,
        living,
        paperStyle,
        fontStyle,
        height,
        thickness,
        width,
        positionIndex,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save volume.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(book.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove volume.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Add new book" : `Customize ${book.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="stationery-card relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto p-5 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close book studio"
          className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Live Header & Physical Proportion Preview */}
        <div className="mb-5 flex items-center gap-4 pr-10">
          <div className="flex items-end gap-2">
            {/* Live Spine Preview */}
            <div
              className="flex flex-col items-center justify-between overflow-hidden rounded-[2px] border border-black/15 py-2 text-center shadow-xs transition-all duration-200"
              style={{
                width: Math.max(14, Math.round(thickness * 82)),
                height: Math.round(Math.min(1.18, Math.max(0.8, height / 2.12)) * 118),
                backgroundColor: cover,
                color: ink,
              }}
              title={`Spine thickness: ${thickness.toFixed(2)}`}
            >
              <span
                className="h-1 w-full"
                style={{
                  backgroundColor: accent,
                  opacity: spineStyle === "minimal" ? 0 : 0.9,
                }}
              />
              <span
                className="px-0.5 text-[7px] font-medium tracking-wider uppercase"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  fontFamily: "var(--serif)",
                }}
              >
                {previewBook.shortTitle.slice(0, 18)}
              </span>
              <span className="text-[7px] font-bold opacity-85">
                {spineMark.slice(0, 3)}
              </span>
            </div>

            <BookMotifPreview book={previewBook} size="md" />
          </div>

          <div className="min-w-0">
            <p className="eyebrow">
              {mode === "create" ? "Add Volume to Shelf" : "Book Studio"}
            </p>
            <h2
              className="m-0 truncate text-2xl sm:text-3xl font-normal tracking-tight"
              style={{ fontFamily: "var(--serif)" }}
            >
              {previewBook.title}
            </h2>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Slot #{positionIndex + 1} of {totalSlots} ·{" "}
              {thickness <= 0.15 ? "Thin" : thickness >= 0.32 ? "Thick" : "Standard"} ·{" "}
              {COVER_TEMPLATES.find((t) => t.id === coverTemplate)?.label}
            </p>
          </div>
        </div>

        {/* Minimal Tabs */}
        <div
          className="mb-5 grid grid-cols-3 border border-[var(--hairline)] bg-[var(--paper)]"
          role="tablist"
        >
          {[
            { id: "cover" as const, label: "Outer Look" },
            { id: "wordings" as const, label: "Wordings & Page" },
            { id: "size" as const, label: "Size & Shelf Spot" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`py-2.5 text-[11px] font-semibold tracking-wider uppercase transition cursor-pointer ${
                tab === item.id
                  ? "bg-[var(--ink)] text-[var(--paper-light)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {tab === "cover" && (
            <div className="space-y-5">
              {/* Quick title input here too so creating/renaming is immediate */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Book Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (syncSpineTitle) setShortTitle(e.target.value);
                  }}
                  placeholder="My Memories"
                  className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                />
              </div>

              {/* Outer Cover Card Design */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Outer Cover Style
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {COVER_TEMPLATES.map((tpl) => {
                    const active = coverTemplate === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setCoverTemplate(tpl.id)}
                        className={`border p-2.5 text-left transition cursor-pointer ${
                          active
                            ? "border-[var(--ink)] bg-[var(--paper-light)] ring-1 ring-[var(--ink)]"
                            : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink-soft)]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{tpl.label}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
                          {tpl.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Front Cover Image Upload */}
              <div className="border border-[var(--hairline)] bg-[var(--paper)] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Custom Front Card Image (optional)
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                      Upload any photograph or artwork for the outer cover.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleCoverUpload(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingCover}
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 border border-[var(--ink)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:bg-[var(--paper-deep)] disabled:opacity-50"
                    >
                      {uploadingCover ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      <span>{coverImage ? "Replace Image" : "Upload Cover"}</span>
                    </button>
                    {coverImage && (
                      <button
                        type="button"
                        onClick={() => setCoverImage("")}
                        className="border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent)] cursor-pointer hover:border-[var(--accent)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {coverImage && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-2.5">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={resolveMediaUrl(coverImage)}
                        alt="Cover preview"
                        className="h-10 w-8 border border-black/15 object-cover"
                      />
                      <span className="text-xs text-[var(--ink-soft)]">
                        Custom cover artwork attached
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showCoverTextWithImage}
                        onChange={(e) => setShowCoverTextWithImage(e.target.checked)}
                      />
                      <span>Show title text</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Spine Look + Motif */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Shelf Spine Style
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SPINE_STYLES.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setSpineStyle(sp.id)}
                        className={`border px-2.5 py-1.5 text-xs cursor-pointer ${
                          spineStyle === sp.id
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper)]"
                        }`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Classic Foil Pattern
                  </label>
                  <select
                    value={motif}
                    onChange={(e) => setMotif(e.target.value as BookMotif)}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm capitalize"
                  >
                    {MOTIFS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Colors */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Unique Outer Binding Palettes
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CLOTH_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setCover(preset.cover);
                        setSecondary(preset.secondary);
                        setAccent(preset.accent);
                        setInk(preset.ink);
                      }}
                      className="flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1 text-xs cursor-pointer hover:border-[var(--ink)]"
                    >
                      <span className="inline-flex items-center -space-x-1">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-black/20"
                          style={{ backgroundColor: preset.cover }}
                        />
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-black/20"
                          style={{ backgroundColor: preset.secondary }}
                        />
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-black/20"
                          style={{ backgroundColor: preset.accent }}
                        />
                      </span>
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Cloth Cover
                  </span>
                  <input
                    type="color"
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    className="h-9 w-full cursor-pointer border border-[var(--hairline)] bg-transparent p-1"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Band & Plaque
                  </span>
                  <input
                    type="color"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="h-9 w-full cursor-pointer border border-[var(--hairline)] bg-transparent p-1"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Neon Accent
                  </span>
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="h-9 w-full cursor-pointer border border-[var(--hairline)] bg-transparent p-1"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Lettering Ink
                  </span>
                  <input
                    type="color"
                    value={ink}
                    onChange={(e) => setInk(e.target.value)}
                    className="h-9 w-full cursor-pointer border border-[var(--hairline)] bg-transparent p-1"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--ink-soft)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={living}
                  onChange={(e) => setLiving(e.target.checked)}
                />
                <span>Subtle satin light shimmer across the cover when inspected</span>
              </label>
            </div>
          )}

          {tab === "wordings" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Cover Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (syncSpineTitle) setShortTitle(e.target.value);
                    }}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Spine Title
                  </label>
                  <input
                    type="text"
                    value={syncSpineTitle ? title : shortTitle}
                    onChange={(e) => {
                      setSyncSpineTitle(false);
                      setShortTitle(e.target.value);
                    }}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Top Cover Header
                  </label>
                  <input
                    type="text"
                    value={coverImprint}
                    onChange={(e) => setCoverImprint(e.target.value)}
                    placeholder="PERSONAL ARCHIVE"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Cover Subtitle
                  </label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Optional subtitle"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Spine Year
                    </label>
                    <input
                      type="text"
                      value={yearLabel}
                      onChange={(e) => setYearLabel(e.target.value)}
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Spine Mark
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={spineMark}
                      onChange={(e) => setSpineMark(e.target.value)}
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Opening Welcome Note (shown inside blank book)
                </label>
                <textarea
                  rows={2}
                  value={welcomeNote}
                  onChange={(e) => setWelcomeNote(e.target.value)}
                  placeholder="Welcome to your quiet blank pages. Write whenever a day deserves keeping."
                  className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                />
              </div>

              {/* Inside Paper & Typeface */}
              <div className="grid gap-3 border-t border-[var(--hairline)] pt-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Inside Page Paper
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAPER_STYLES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaperStyle(p.id)}
                        className={`border px-2.5 py-1.5 text-left text-xs cursor-pointer ${
                          paperStyle === p.id
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper)]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Inside Page Typography
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FONT_STYLES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFontStyle(f.id)}
                        className={`border px-2 py-2 text-center text-xs cursor-pointer ${
                          fontStyle === f.id
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper)]"
                        }`}
                      >
                        {f.label.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--hairline)] pt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Bottom Cover Footer (optional)
                    </label>
                    <input
                      type="text"
                      value={coverFooter}
                      onChange={(e) => setCoverFooter(e.target.value)}
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Back Cover Attribution
                    </label>
                    <input
                      type="text"
                      value={quoteBy}
                      onChange={(e) => setQuoteBy(e.target.value)}
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Back Cover Summary
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Back Cover Quote
                  </label>
                  <input
                    type="text"
                    value={quote}
                    onChange={(e) => setQuote(e.target.value)}
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "size" && (
            <div className="space-y-5">
              {/* Size Presets */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Book Proportion Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {SIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setThickness(preset.thickness);
                        setHeight(preset.height);
                        setWidth(preset.width);
                      }}
                      className="border border-[var(--hairline)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium cursor-pointer hover:border-[var(--ink)]"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine Sliders */}
              <div className="grid gap-4 border border-[var(--hairline)] bg-[var(--paper)] p-4 sm:grid-cols-3">
                <label className="block">
                  <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    <span>Spine Thickness</span>
                    <span>{thickness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.11}
                    max={0.48}
                    step={0.01}
                    value={thickness}
                    onChange={(e) => setThickness(Number(e.target.value))}
                    className="w-full cursor-pointer accent-[var(--ink)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-soft)]">
                    <span>Thin</span>
                    <span>Thick</span>
                  </div>
                </label>

                <label className="block">
                  <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    <span>Book Height</span>
                    <span>{height.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={1.6}
                    max={2.45}
                    step={0.02}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full cursor-pointer accent-[var(--ink)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-soft)]">
                    <span>Pocket</span>
                    <span>Tall</span>
                  </div>
                </label>

                <label className="block">
                  <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    <span>Cover Width</span>
                    <span>{width.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={1.05}
                    max={1.5}
                    step={0.02}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full cursor-pointer accent-[var(--ink)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-soft)]">
                    <span>Narrow</span>
                    <span>Wide</span>
                  </div>
                </label>
              </div>

              {/* Shelf Placement Selector */}
              <div className="border border-[var(--hairline)] bg-[var(--paper)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Shelf Placement
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                      Choose where this book sits along the walnut shelf (left to right).
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={positionIndex <= 0}
                      onClick={() => setPositionIndex((p) => Math.max(0, p - 1))}
                      aria-label="Move one slot left"
                      className="grid h-8 w-8 place-items-center border border-[var(--hairline)] bg-[var(--paper-light)] cursor-pointer hover:border-[var(--ink)] disabled:opacity-35"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[64px] text-center text-xs font-semibold">
                      Slot #{positionIndex + 1}
                    </span>
                    <button
                      type="button"
                      disabled={positionIndex >= totalSlots - 1}
                      onClick={() =>
                        setPositionIndex((p) => Math.min(totalSlots - 1, p + 1))
                      }
                      aria-label="Move one slot right"
                      className="grid h-8 w-8 place-items-center border border-[var(--hairline)] bg-[var(--paper-light)] cursor-pointer hover:border-[var(--ink)] disabled:opacity-35"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Visual Shelf Slot Bar */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Array.from({ length: totalSlots }).map((_, idx) => {
                    const active = positionIndex === idx;
                    const occupant = shelfBooks[idx]?.title;
                    return (
                      <button
                        key={idx}
                        type="button"
                        title={occupant ? `Slot #${idx + 1} (${occupant})` : `Slot #${idx + 1}`}
                        onClick={() => setPositionIndex(idx)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition ${
                          active
                            ? "bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border border-[var(--hairline)] bg-[var(--paper-light)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                        }`}
                      >
                        #{idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Remove Book option when editing & > 1 book exists */}
              {mode === "edit" && onDelete && shelfBooks.length > 1 && (
                <div className="border-t border-[var(--hairline)] pt-4">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove This Book From Shelf</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] p-3">
                      <span className="text-xs text-[var(--danger-ink)]">
                        Remove “{book.title}” and its memories from the shelf?
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1 text-xs cursor-pointer"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete()}
                          className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white cursor-pointer"
                        >
                          Remove Book
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-ink)]">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-[var(--hairline)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingCover}
              className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)] disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : mode === "create"
                  ? "Place Book on Shelf"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
