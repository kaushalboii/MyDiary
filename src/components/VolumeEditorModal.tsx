"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { BookMotif, DiaryBook } from "@/lib/types";
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
  { name: "Burgundy", cover: "#6f2130", accent: "#d5a756", ink: "#f4ead7" },
  { name: "Sage", cover: "#4d746d", accent: "#b36b43", ink: "#f0e5cf" },
  { name: "Parchment", cover: "#e8ddc6", accent: "#2457a6", ink: "#bf493f" },
  { name: "Midnight", cover: "#162c55", accent: "#9eb4e8", ink: "#f1eee5" },
  { name: "Charcoal", cover: "#262421", accent: "#f16f5b", ink: "#d9edf0" },
  { name: "Terracotta", cover: "#d36e5d", accent: "#172f49", ink: "#f8ecdc" },
  { name: "Olive", cover: "#626a49", accent: "#9c3d39", ink: "#eee5cf" },
  { name: "Forest", cover: "#365943", accent: "#c7a45e", ink: "#eee7d6" },
  { name: "Plum", cover: "#4c3970", accent: "#9ad3bf", ink: "#f3ecdb" },
  { name: "Sand", cover: "#d8bd8c", accent: "#8e2f36", ink: "#272523" },
];

export function VolumeEditorModal({
  book,
  open,
  onClose,
  onSave,
}: {
  book: DiaryBook;
  open: boolean;
  onClose: () => void;
  onSave: (patch: Partial<DiaryBook>) => Promise<void>;
}) {
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle);
  const [yearLabel, setYearLabel] = useState(book.yearLabel);
  const [description, setDescription] = useState(book.description);
  const [quote, setQuote] = useState(book.quote);
  const [cover, setCover] = useState(book.cover);
  const [accent, setAccent] = useState(book.accent);
  const [ink, setInk] = useState(book.ink);
  const [motif, setMotif] = useState<BookMotif>(book.motif);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const previewBook: DiaryBook = {
    ...book,
    title: title || book.title,
    shortTitle: title || book.title,
    subtitle,
    yearLabel,
    description,
    quote,
    cover,
    accent,
    ink,
    motif,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || book.title,
        shortTitle: title.trim() || book.title,
        subtitle: subtitle.trim(),
        yearLabel: yearLabel.trim(),
        description: description.trim(),
        quote: quote.trim(),
        cover,
        accent,
        ink,
        motif,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Customize ${book.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="stationery-card relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close volume customizer"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-center gap-5">
          <BookMotifPreview book={previewBook} size="md" />
          <div>
            <p className="eyebrow">Customize Clothbound Volume</p>
            <h2
              className="m-0 text-3xl font-normal tracking-tight"
              style={{ fontFamily: "var(--serif)" }}
            >
              {previewBook.title}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Notebook Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Spine Badge / Year
              </label>
              <input
                type="text"
                value={yearLabel}
                onChange={(e) => setYearLabel(e.target.value)}
                className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
              Subtitle
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
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
              Back Cover Epigraph Quote
            </label>
            <input
              type="text"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
              Clothbound Cover Palette
            </label>
            <div className="flex flex-wrap gap-2">
              {CLOTH_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setCover(preset.cover);
                    setAccent(preset.accent);
                    setInk(preset.ink);
                  }}
                  className={`inline-flex items-center gap-2 border px-2.5 py-1.5 text-xs cursor-pointer ${
                    cover === preset.cover
                      ? "border-[var(--ink)] bg-[var(--paper-deep)] font-semibold"
                      : "border-[var(--hairline)] bg-[var(--paper)]"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/15"
                    style={{ backgroundColor: preset.cover }}
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
              Foil Motif Pattern
            </label>
            <select
              value={motif}
              onChange={(e) => setMotif(e.target.value as BookMotif)}
              className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm capitalize"
            >
              {MOTIFS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-[var(--hairline)] bg-[var(--paper)] px-4 py-2 text-xs font-semibold tracking-wider uppercase cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
            >
              {saving ? "Updating Cover..." : "Update 3D Volume"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
