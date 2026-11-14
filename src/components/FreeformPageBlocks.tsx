"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  GripVertical,
  Layers,
  MapPin,
  Minus,
  Plus,
  RotateCw,
  StickyNote,
} from "lucide-react";
import {
  clampBlock,
  getPageAccentColor,
} from "@/lib/memory-layout";
import { resolveMediaUrl } from "@/lib/storage-client";
import type { DiaryBook, MemoryAlbum, MemoryLayoutBlock } from "@/lib/types";

const PHOTO_DEFAULT_TILTS = ["-2deg", "2deg", "-1.5deg", "2.5deg"];

type BlockDragSession = {
  blockId: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  initialBlock: MemoryLayoutBlock;
};

export function FreeformPageSurface({
  memory,
  book,
  side,
  blocks,
  editing,
  selectedBlockId,
  onSelectBlock,
  onChangeBlocks,
  onPhotoClick,
  surfaceIdPrefix,
  compact = false,
}: {
  memory: Pick<
    MemoryAlbum,
    "id" | "title" | "date" | "location" | "mood" | "note" | "paragraphs" | "photos" | "albumStyle"
  >;
  book?: Pick<DiaryBook, "accent" | "pageAccent">;
  side: "left" | "right";
  blocks: MemoryLayoutBlock[];
  editing: boolean;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onChangeBlocks: (next: MemoryLayoutBlock[], commit: boolean) => void;
  onPhotoClick?: (photoIndex: number) => void;
  surfaceIdPrefix: string;
  compact?: boolean;
}) {
  const dragRef = useRef<BlockDragSession | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  useEffect(() => {
    function handleWindowMove(e: PointerEvent) {
      const session = dragRef.current;
      if (!session) return;

      const leftEl = document.querySelector<HTMLElement>(
        `[data-freeform-surface="${surfaceIdPrefix}"][data-freeform-side="left"]`,
      );
      const rightEl = document.querySelector<HTMLElement>(
        `[data-freeform-surface="${surfaceIdPrefix}"][data-freeform-side="right"]`,
      );
      if (!leftEl && !rightEl) return;

      const leftRect = leftEl?.getBoundingClientRect() || null;
      const rightRect = rightEl?.getBoundingClientRect() || null;

      let targetSide = session.initialBlock.side;
      let targetRect = targetSide === "right" ? rightRect || leftRect! : leftRect || rightRect!;

      if (session.mode === "move" && leftRect && rightRect) {
        const splitX = (leftRect.right + rightRect.left) / 2;
        if (Math.abs(rightRect.left - leftRect.left) > 40) {
          if (e.clientX >= splitX) {
            targetSide = "right";
            targetRect = rightRect;
          } else {
            targetSide = "left";
            targetRect = leftRect;
          }
        }
      }

      const currentBlocks = blocksRef.current;
      const current = currentBlocks.find((b) => b.id === session.blockId);
      if (!current || targetRect.width <= 0 || targetRect.height <= 0) return;

      let updatedBlock: MemoryLayoutBlock;
      if (session.mode === "resize") {
        const dxPct = ((e.clientX - session.startClientX) / targetRect.width) * 100;
        updatedBlock = clampBlock({
          ...current,
          w: session.initialBlock.w + dxPct,
        });
      } else {
        const rawX =
          ((e.clientX - session.grabOffsetX - targetRect.left) / targetRect.width) * 100;
        const rawY =
          ((e.clientY - session.grabOffsetY - targetRect.top) / targetRect.height) * 100;
        updatedBlock = clampBlock({
          ...current,
          side: targetSide,
          x: rawX,
          y: rawY,
        });
      }

      const nextList = currentBlocks.map((b) => (b.id === session.blockId ? updatedBlock : b));
      onChangeBlocks(nextList, false);
    }

    function handleWindowUp() {
      const session = dragRef.current;
      if (!session) return;
      dragRef.current = null;
      setActiveDragId(null);
      onChangeBlocks(blocksRef.current, true);
    }

    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("pointercancel", handleWindowUp);
    };
  }, [onChangeBlocks, surfaceIdPrefix]);

  const sideBlocks = [...blocks]
    .filter((b) => b.side === side)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const sidePhotoBlocks = sideBlocks.filter((b) => b.kind === "photo");

  const accentColor = book ? getPageAccentColor(book) : "var(--accent)";

  function startDrag(
    e: React.PointerEvent<HTMLElement>,
    block: MemoryLayoutBlock,
    mode: "move" | "resize",
  ) {
    if (!editing) return;
    if ((e.target as HTMLElement)?.closest("[data-block-action]")) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectBlock(block.id);
    const blockEl = e.currentTarget.closest<HTMLElement>("[data-freeform-block]");
    const blockRect = blockEl?.getBoundingClientRect();
    const maxZ = Math.max(1, ...blocks.map((b) => b.z ?? 1));
    const raised = blocks.map((b) => (b.id === block.id ? { ...b, z: maxZ + 1 } : b));
    if ((block.z ?? 1) < maxZ) {
      onChangeBlocks(raised, false);
    }
    dragRef.current = {
      blockId: block.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      grabOffsetX: blockRect ? e.clientX - blockRect.left : 24,
      grabOffsetY: blockRect ? e.clientY - blockRect.top : 18,
      initialBlock: block,
    };
    setActiveDragId(block.id);
  }

  function mutateBlock(blockId: string, updater: (b: MemoryLayoutBlock) => MemoryLayoutBlock) {
    const next = blocks.map((b) => (b.id === blockId ? clampBlock(updater(b)) : b));
    onChangeBlocks(next, true);
  }

  return (
    <div
      data-freeform-surface={surfaceIdPrefix}
      data-freeform-side={side}
      onClick={(e) => {
        if (editing && e.target === e.currentTarget) onSelectBlock(null);
      }}
      className={`freeform-canvas-page flex-1 h-full ${
        editing ? "freeform-canvas-page--editing" : ""
      } ${compact ? "min-h-[250px] sm:min-h-[300px]" : "min-h-[450px] lg:min-h-[490px]"}`}
    >
      {editing && sideBlocks.length === 0 && (
        <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-[var(--hairline)] text-center">
          <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--ink-soft)] opacity-75">
            Drop items here for {side} page
          </span>
        </div>
      )}

      {sideBlocks.map((block) => {
        const isSelected = editing && selectedBlockId === block.id;
        const isDragging = activeDragId === block.id;

        const photoIndex =
          block.kind === "photo" && block.photoId
            ? memory.photos.findIndex((p) => p.id === block.photoId)
            : -1;
        const photo = photoIndex >= 0 ? memory.photos[photoIndex] : undefined;

        if (block.kind === "photo" && !photo) return null;

        return (
          <div
            key={block.id}
            data-freeform-block={block.id}
            data-no-flip={editing || block.kind === "photo" ? "true" : undefined}
            onPointerDown={(e) => startDrag(e, block, "move")}
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.w}%`,
              zIndex: isDragging ? 80 : (block.z ?? 1),
              touchAction: editing ? "none" : undefined,
            }}
            className={`freeform-block ${
              editing
                ? "cursor-grab active:cursor-grabbing rounded-md ring-1 transition-[box-shadow] " +
                  (isSelected
                    ? "ring-[var(--ink)] shadow-lg bg-[var(--paper)]/45"
                    : "ring-[var(--hairline)] hover:ring-[var(--ink-soft)] bg-[var(--paper)]/20")
                : ""
            } ${isDragging ? "ring-2 ring-[var(--accent)] shadow-2xl" : ""}`}
          >
            {editing && (
              <div
                data-no-flip="true"
                className="mb-1 flex items-center justify-between gap-1 rounded-t px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase bg-[var(--paper)]/90 border-b border-[var(--hairline)] text-[var(--ink-soft)]"
              >
                <span className="inline-flex items-center gap-1 truncate">
                  <GripVertical className="h-2.5 w-2.5 shrink-0" />
                  <span>
                    {block.kind === "header"
                      ? "Title"
                      : block.kind === "note"
                        ? "Note"
                        : block.kind === "text"
                          ? "Words"
                          : `Photo ${photoIndex + 1}`}
                  </span>
                </span>

                <div className="flex items-center gap-0.5" data-block-action="true">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mutateBlock(block.id, (b) => ({ ...b, w: b.w - 8 }));
                    }}
                    title="Narrower"
                    className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mutateBlock(block.id, (b) => ({ ...b, w: b.w + 8 }));
                    }}
                    title="Wider"
                    className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mutateBlock(block.id, (b) => ({
                        ...b,
                        side: b.side === "left" ? "right" : "left",
                      }));
                    }}
                    title={`Move to ${block.side === "left" ? "right" : "left"} page`}
                    className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <ArrowLeftRight className="h-2.5 w-2.5" />
                  </button>
                  {block.kind === "photo" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const steps = [-4, 0, 4, -2, 2];
                        const cur = Math.round(block.rotation ?? 0);
                        const idx = steps.indexOf(cur);
                        const nextRot = steps[(idx + 1) % steps.length];
                        mutateBlock(block.id, (b) => ({ ...b, rotation: nextRot }));
                      }}
                      title="Tilt photo"
                      className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--paper-deep)] cursor-pointer"
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const maxZ = Math.max(1, ...blocks.map((x) => x.z ?? 1));
                      mutateBlock(block.id, (b) => ({ ...b, z: maxZ + 1 }));
                    }}
                    title="Bring forward"
                    className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <Layers className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            )}

            <div className={editing ? "p-1.5" : ""}>
              {block.kind === "header" && (
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold tracking-[0.14em] uppercase text-[var(--ink-soft)]">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                      {memory.date}
                    </span>
                    {memory.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                        {memory.location}
                      </span>
                    )}
                    {memory.mood && (
                      <span
                        className="rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5"
                        style={{ color: accentColor }}
                      >
                        {memory.mood}
                      </span>
                    )}
                  </div>
                  {memory.title?.trim() && memory.title.trim() !== "Encrypted Entry" && (
                    <h2
                      className={`mb-0 font-normal tracking-tight leading-[1.08] text-[var(--page-ink)] ${
                        compact ? "mt-1.5 text-base sm:text-lg" : "mt-3 text-2xl sm:text-3xl"
                      }`}
                    >
                      {memory.title}
                    </h2>
                  )}
                </div>
              )}

              {block.kind === "note" && memory.note?.trim() && (
                <div
                  className={compact ? "note-slip p-2!" : "note-slip"}
                  style={{ borderLeftColor: accentColor }}
                >
                  <div
                    className="mb-1 flex items-center gap-1 text-[9px] font-semibold tracking-[0.15em] uppercase"
                    style={{ color: accentColor }}
                  >
                    <StickyNote className="h-2.5 w-2.5" />
                    <span>Keepsake Note</span>
                  </div>
                  <p
                    className={`m-0 italic leading-relaxed text-[var(--page-ink)] ${
                      compact ? "text-xs" : "text-sm sm:text-base"
                    }`}
                  >
                    “{memory.note}”
                  </p>
                </div>
              )}

              {block.kind === "text" && memory.paragraphs.length > 0 && (
                <div
                  className={`space-y-2.5 text-[var(--page-ink-muted)] ${
                    compact ? "text-[11px] leading-snug" : "text-[15px] leading-[1.65]"
                  }`}
                >
                  {memory.paragraphs.map((paragraph, pIdx) => (
                    <p key={pIdx} className="m-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}

              {block.kind === "photo" && photo && (
                <figure
                  className={`m-0 ${
                    memory.albumStyle === "portrait"
                      ? "border-0 p-0 bg-transparent shadow-xl rounded-2xl overflow-hidden"
                      : memory.albumStyle === "filmstrip"
                        ? "filmstrip-frame"
                        : memory.albumStyle === "grid"
                          ? "border border-[var(--hairline)] bg-[var(--paper-light)] p-2 shadow-sm"
                          : compact
                            ? "polaroid-frame p-1.5! pb-3!"
                            : "polaroid-frame"
                  }`}
                  style={{
                    transform: `rotate(${
                      block.rotation !== undefined
                        ? `${block.rotation}deg`
                        : memory.albumStyle === "portrait"
                          ? "0deg"
                          : memory.albumStyle === "polaroid"
                            ? PHOTO_DEFAULT_TILTS[photoIndex % PHOTO_DEFAULT_TILTS.length]
                            : "0deg"
                    })`,
                  }}
                >
                  <button
                    type="button"
                    data-no-flip="true"
                    onClick={(e) => {
                      if (editing) {
                        e.preventDefault();
                        return;
                      }
                      onPhotoClick?.(photoIndex);
                    }}
                    className="block w-full overflow-hidden bg-[var(--paper-deep)] cursor-pointer"
                  >
                    <img
                      src={resolveMediaUrl(photo.url)}
                      alt={photo.caption || `Photo ${photoIndex + 1}`}
                      draggable={false}
                      className={`w-full ${
                        memory.albumStyle === "portrait"
                          ? sidePhotoBlocks.length > 1 && block.w > 60
                            ? "aspect-[16/10] sm:aspect-[16/9] max-h-[26vh] sm:max-h-[190px] object-cover"
                            : sidePhotoBlocks.length > 1
                              ? "aspect-[4/3] sm:aspect-[3/4] max-h-[24vh] sm:max-h-[180px] object-cover"
                              : "aspect-[3/4] sm:aspect-[4/5] max-h-[50vh] sm:max-h-[420px] object-cover"
                          : memory.albumStyle === "filmstrip"
                            ? compact
                              ? "max-h-24 object-contain"
                              : "max-h-56 object-contain"
                            : memory.albumStyle === "grid"
                              ? sidePhotoBlocks.length > 1 && block.w > 60
                                ? "aspect-[16/10] max-h-[24vh] sm:max-h-[180px] object-cover"
                                : "aspect-[4/3] max-h-[24vh] sm:max-h-[180px] object-cover"
                              : sidePhotoBlocks.length > 1 && block.w > 60
                                ? "aspect-[16/10] max-h-[24vh] sm:max-h-[180px] object-cover"
                                : sidePhotoBlocks.length > 1
                                  ? "aspect-square max-h-[22vh] sm:max-h-[160px] object-cover"
                                  : "aspect-square max-h-[45vh] sm:max-h-[360px] object-cover"
                      }`}
                    />
                  </button>
                  {(photo.caption || (memory.albumStyle !== "grid" && memory.albumStyle !== "portrait")) && (
                    <figcaption
                      className={`px-1 text-center italic ${
                        compact ? "mt-1 text-[9px]" : "mt-2 text-xs"
                      } ${
                        memory.albumStyle === "filmstrip"
                          ? "text-[#dfd7c7]"
                          : memory.albumStyle === "portrait"
                            ? "mt-2.5 font-serif text-xs tracking-wider text-[var(--page-ink-muted)]"
                            : "text-[var(--page-ink-muted)]"
                      }`}
                    >
                      {photo.caption || `${memory.date} · Frame ${photoIndex + 1}`}
                    </figcaption>
                  )}
                </figure>
              )}
            </div>

            {editing && (
              <div
                onPointerDown={(e) => startDrag(e, block, "resize")}
                title="Drag to resize width"
                className="hidden sm:block absolute -right-1 -bottom-1 h-3 w-3 rounded-full border border-[var(--paper-light)] bg-[var(--accent)] cursor-ew-resize shadow-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
