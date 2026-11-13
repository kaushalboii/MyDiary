import type { CSSProperties } from "react";
import type {
  BookFontStyle,
  DiaryBook,
  MemoryAlbum,
  MemoryLayoutBlock,
  PageHeaderStyle,
  PageNumberStyle,
  PaperStyle,
} from "./types";

export function isValidHexColor(value: string | undefined | null): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function isHexDark(hex: string | undefined): boolean {
  if (!isValidHexColor(hex)) return false;
  const clean = hex.trim().slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 0.48;
}

export function getContrastInk(hex: string | undefined, darkDefault = "#25221E", lightDefault = "#F3EDE2"): string {
  return isHexDark(hex) ? lightDefault : darkDefault;
}

export function getBookFontCss(fontStyle: BookFontStyle | undefined): string {
  if (fontStyle === "sans") return "var(--sans)";
  if (fontStyle === "mono") {
    return 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace';
  }
  return "var(--serif)";
}

export function getBookPaperCss(book: Pick<DiaryBook, "paperStyle" | "pageTint" | "pageAccent" | "accent">): CSSProperties {
  const hasTint = isValidHexColor(book.pageTint);
  const darkTint = hasTint && isHexDark(book.pageTint);
  const bg = hasTint ? book.pageTint : "var(--page-bg)";
  const ruleLine = hasTint
    ? darkTint
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(37, 35, 31, 0.085)"
    : "var(--page-line)";
  const dotColor = hasTint
    ? darkTint
      ? "rgba(255, 255, 255, 0.16)"
      : "rgba(37, 35, 31, 0.14)"
    : "var(--page-dot)";
  const marginAccent = isValidHexColor(book.pageAccent)
    ? book.pageAccent
    : book.accent || "#A64B32";

  if (book.paperStyle === "lined") {
    return {
      backgroundColor: bg,
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 29px, ${ruleLine} 29px, ${ruleLine} 30px)`,
      backgroundPosition: "0 18px",
    };
  }

  if (book.paperStyle === "margin-lined") {
    return {
      backgroundColor: bg,
      backgroundImage: `linear-gradient(to right, transparent 42px, ${marginAccent}33 42px, ${marginAccent}33 43px, transparent 43px), repeating-linear-gradient(to bottom, transparent 0px, transparent 29px, ${ruleLine} 29px, ${ruleLine} 30px)`,
      backgroundPosition: "0 18px",
    };
  }

  if (book.paperStyle === "dotgrid") {
    return {
      backgroundColor: bg,
      backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
      backgroundSize: "20px 20px",
    };
  }

  if (book.paperStyle === "grid") {
    return {
      backgroundColor: bg,
      backgroundImage: `linear-gradient(to right, ${ruleLine} 1px, transparent 1px), linear-gradient(to bottom, ${ruleLine} 1px, transparent 1px)`,
      backgroundSize: "22px 22px",
    };
  }

  return {
    backgroundColor: bg,
  };
}

export function getBookPageStyleVars(book: Pick<DiaryBook, "pageTint" | "pageInk" | "pageAccent" | "accent">): CSSProperties {
  const hasTint = isValidHexColor(book.pageTint);
  const darkTint = hasTint && isHexDark(book.pageTint);
  const resolvedInk = isValidHexColor(book.pageInk)
    ? book.pageInk
    : hasTint
      ? getContrastInk(book.pageTint, "#24211C", "#F2ECE0")
      : undefined;
  const resolvedMutedInk = isValidHexColor(book.pageInk)
    ? `${book.pageInk}CC`
    : hasTint
      ? darkTint
        ? "rgba(242, 236, 224, 0.76)"
        : "rgba(36, 33, 28, 0.78)"
      : undefined;
  const resolvedSoftInk = hasTint
    ? darkTint
      ? "rgba(242, 236, 224, 0.56)"
      : "rgba(36, 33, 28, 0.54)"
    : undefined;
  const resolvedHairline = hasTint
    ? darkTint
      ? "rgba(255, 255, 255, 0.14)"
      : "rgba(37, 35, 31, 0.14)"
    : undefined;
  const resolvedAccent = isValidHexColor(book.pageAccent) ? book.pageAccent : undefined;

  return {
    ...(resolvedInk ? { "--page-ink": resolvedInk, color: resolvedInk } : {}),
    ...(resolvedMutedInk ? { "--page-ink-muted": resolvedMutedInk } : {}),
    ...(resolvedSoftInk ? { "--ink-soft": resolvedSoftInk } : {}),
    ...(resolvedHairline ? { "--hairline": resolvedHairline } : {}),
    ...(resolvedAccent ? { "--page-accent": resolvedAccent } : {}),
  } as CSSProperties;
}

export function toRomanNumeral(num: number): string {
  const map: [number, string][] = [
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = Math.max(1, Math.round(num));
  let out = "";
  for (const [val, sym] of map) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out;
}

export function formatBookPageNumber(pageNumber: number, style: PageNumberStyle | undefined): string {
  if (style === "hidden") return "";
  if (style === "roman") return toRomanNumeral(pageNumber).toLowerCase();
  if (style === "minimal") return String(pageNumber).padStart(2, "0");
  return `p. ${String(pageNumber).padStart(2, "0")}`;
}

export function getPageAccentColor(book: Pick<DiaryBook, "pageAccent" | "accent">): string {
  return isValidHexColor(book.pageAccent) ? book.pageAccent : book.accent || "#A64B32";
}

export function getPageHeaderLabel(style: PageHeaderStyle | undefined): string {
  if (style === "centered") return "Centered Archival";
  if (style === "ruled") return "Double Ruled";
  if (style === "botanical") return "Botanical Seal";
  return "Minimal Quiet";
}

export function hasMemoryContent(mem: {
  title?: string;
  note?: string;
  paragraphs?: string[];
  photos?: unknown[];
}): boolean {
  return Boolean(
    mem.title?.trim() ||
      mem.note?.trim() ||
      (Array.isArray(mem.paragraphs) && mem.paragraphs.some((p) => p.trim())) ||
      (Array.isArray(mem.photos) && mem.photos.length > 0),
  );
}

export function getMemoryDisplayTitle(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
  fallback = "Untitled Page",
): string {
  if (mem.title?.trim()) return mem.title.trim();
  if (mem.note?.trim()) {
    const clean = mem.note.trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  }
  const firstPara = mem.paragraphs?.find((p) => p.trim())?.trim();
  if (firstPara) {
    return firstPara.length > 42 ? `${firstPara.slice(0, 42)}…` : firstPara;
  }
  if (mem.photos?.length) {
    return mem.photos.length === 1 ? "Photo Keepsake" : `${mem.photos.length} Photographs`;
  }
  return fallback;
}

export function isImagesOnlyMemory(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
): boolean {
  return (
    !mem.title?.trim() &&
    !mem.note?.trim() &&
    !(mem.paragraphs && mem.paragraphs.some((p) => p.trim())) &&
    Boolean(mem.photos?.length)
  );
}

export function isWordsOnlyMemory(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
): boolean {
  return Boolean(
    (mem.title?.trim() || mem.note?.trim() || mem.paragraphs?.some((p) => p.trim())) &&
      (!mem.photos || mem.photos.length === 0),
  );
}

export function clampBlock(block: MemoryLayoutBlock): MemoryLayoutBlock {
  const w = Math.max(20, Math.min(94, Math.round(block.w)));
  const maxX = Math.max(2, 97 - w);
  const x = Math.max(2, Math.min(maxX, Math.round(block.x)));
  const y = Math.max(2, Math.min(82, Math.round(block.y)));
  return {
    ...block,
    x,
    y,
    w,
    z: typeof block.z === "number" ? block.z : 1,
  };
}

/**
 * Computes default page placement coordinates matching what content exists in the memory.
 */
export function buildDefaultLayoutBlocks(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
): MemoryLayoutBlock[] {
  const blocks: MemoryLayoutBlock[] = [];
  const hasHeader = Boolean(mem.title?.trim() || mem.note?.trim() || mem.paragraphs?.some((p) => p.trim()));
  let leftY = 5;
  let zCounter = 1;

  if (hasHeader) {
    blocks.push(
      clampBlock({
        id: "header",
        kind: "header",
        side: "left",
        x: 5,
        y: leftY,
        w: 90,
        z: zCounter++,
      }),
    );
    leftY += mem.title?.trim() ? 24 : 18;
  }

  if (mem.note?.trim()) {
    blocks.push(
      clampBlock({
        id: "note",
        kind: "note",
        side: "left",
        x: 5,
        y: leftY,
        w: 90,
        z: zCounter++,
      }),
    );
    leftY += 24;
  }

  if (mem.paragraphs?.some((p) => p.trim())) {
    blocks.push(
      clampBlock({
        id: "text",
        kind: "text",
        side: "left",
        x: 5,
        y: leftY,
        w: 90,
        z: zCounter++,
      }),
    );
  }

  const photos = mem.photos || [];
  const imagesOnly = isImagesOnlyMemory(mem);
  const isPortraitAlbum = (mem as { albumStyle?: string }).albumStyle === "portrait" || photos.length === 1;
  const photoTilts = [-2, 2, -1.5, 2.5];

  photos.forEach((photo, idx) => {
    if (imagesOnly) {
      // Spread images gracefully across both Left and Right pages when there are no words
      const side: "left" | "right" = idx % 2 === 0 ? "left" : "right";
      const slot = Math.floor(idx / 2);
      const countOnSide = Math.ceil((photos.length - (side === "right" ? 1 : 0)) / 2);
      if (countOnSide <= 1) {
        blocks.push(
          clampBlock({
            id: `photo-${photo.id}`,
            kind: "photo",
            photoId: photo.id,
            side,
            x: isPortraitAlbum ? 6 : 12,
            y: isPortraitAlbum ? 6 : 12,
            w: isPortraitAlbum ? 88 : 76,
            z: zCounter++,
            rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
          }),
        );
      } else {
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        blocks.push(
          clampBlock({
            id: `photo-${photo.id}`,
            kind: "photo",
            photoId: photo.id,
            side,
            x: col === 0 ? 5 : 51,
            y: 7 + row * 38,
            w: 44,
            z: zCounter++,
            rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
          }),
        );
      }
    } else {
      const col = photos.length === 1 ? 0 : idx % 2;
      const row = photos.length === 1 ? 0 : Math.floor(idx / 2);
      blocks.push(
        clampBlock({
          id: `photo-${photo.id}`,
          kind: "photo",
          photoId: photo.id,
          side: "right",
          x: photos.length === 1 ? 6 : col === 0 ? 5 : 51,
          y: photos.length === 1 ? 6 : 7 + row * 38,
          w: photos.length === 1 ? 88 : 44,
          z: zCounter++,
          rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
        }),
      );
    }
  });

  return blocks;
}

/**
 * Reconciles saved custom blocks with current content/photos so added or removed photos stay in sync.
 */
export function syncLayoutBlocksWithMemory(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos" | "layoutBlocks">,
): MemoryLayoutBlock[] {
  const fallback = buildDefaultLayoutBlocks(mem);
  const existing = mem.layoutBlocks;
  if (!Array.isArray(existing) || existing.length === 0) return fallback;

  const fallbackById = new Map(fallback.map((b) => [b.id, b]));
  const result: MemoryLayoutBlock[] = [];
  const seen = new Set<string>();

  for (const raw of existing) {
    const valid =
      raw.kind === "photo"
        ? Boolean(raw.photoId && mem.photos.some((p) => p.id === raw.photoId))
        : fallbackById.has(raw.kind);
    const id = raw.kind === "photo" && raw.photoId ? `photo-${raw.photoId}` : raw.kind;
    if (!valid || seen.has(id)) continue;
    seen.add(id);
    result.push(clampBlock({ ...raw, id }));
  }

  for (const def of fallback) {
    if (!seen.has(def.id)) {
      result.push(def);
    }
  }

  return result;
}

