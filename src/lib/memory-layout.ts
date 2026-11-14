import type { CSSProperties } from "react";
import type {
  AlbumPhoto,
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
  fallback = "First",
): string {
  const cleanTitle = mem.title?.trim();
  if (cleanTitle && cleanTitle !== "Encrypted Entry") return cleanTitle;
  if (mem.note?.trim()) {
    const clean = mem.note.trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  }
  const firstPara = mem.paragraphs?.find((p) => p.trim())?.trim();
  if (firstPara) {
    return firstPara.length > 42 ? `${firstPara.slice(0, 42)}…` : firstPara;
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

export function isMinimalTextMemory(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs">,
): boolean {
  const hasParas = Boolean(mem.paragraphs?.some((p) => p.trim()));
  const parasCount = mem.paragraphs?.filter((p) => p.trim()).length || 0;
  return !hasParas || (parasCount === 1 && (mem.paragraphs?.join(" ").length || 0) <= 180);
}

export type MemorySpreadPartition = {
  isPrimary: boolean;
  spreadSubIndex: number;
  totalSubSpreads: number;
  leftPhotos: { photo: AlbumPhoto; idx: number }[];
  rightPhotos: { photo: AlbumPhoto; idx: number }[];
};

/**
 * Automatically partitions memory photos across pages & spreads so that:
 * 1. Each page has at most 3-4 (max 4-6) photos and never squishes or cuts off images.
 * 2. Short-text or title-only memories distribute photos across BOTH left and right pages.
 * 3. Memories with many photos (e.g. 7+ photos) flow across consecutive spreads as a luxury photo album.
 */
export function partitionMemoryIntoSpreads(mem: MemoryAlbum): MemorySpreadPartition[] {
  const photos = mem.photos || [];
  const hasParas = Boolean(mem.paragraphs?.some((p) => p.trim()));
  const parasCount = mem.paragraphs?.filter((p) => p.trim()).length || 0;
  const isLongText = parasCount >= 2 || (hasParas && mem.paragraphs.join(" ").length > 220);
  const isMinimalText = !isLongText;

  // Case 1: No photos
  if (photos.length === 0) {
    return [
      {
        isPrimary: true,
        spreadSubIndex: 0,
        totalSubSpreads: 1,
        leftPhotos: [],
        rightPhotos: [],
      },
    ];
  }

  // Case 2: Minimal text (title only, or title + short note)
  if (isMinimalText) {
    if (photos.length === 1) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [],
          rightPhotos: [{ photo: photos[0], idx: 0 }],
        },
      ];
    }
    if (photos.length === 2) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [{ photo: photos[0], idx: 0 }],
          rightPhotos: [{ photo: photos[1], idx: 1 }],
        },
      ];
    }
    if (photos.length === 3) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [{ photo: photos[0], idx: 0 }],
          rightPhotos: [
            { photo: photos[1], idx: 1 },
            { photo: photos[2], idx: 2 },
          ],
        },
      ];
    }
    if (photos.length === 4) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [],
          rightPhotos: photos.map((p, idx) => ({ photo: p, idx })),
        },
      ];
    }
    if (photos.length === 5) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [
            { photo: photos[0], idx: 0 },
            { photo: photos[1], idx: 1 },
          ],
          rightPhotos: [
            { photo: photos[2], idx: 2 },
            { photo: photos[3], idx: 3 },
            { photo: photos[4], idx: 4 },
          ],
        },
      ];
    }
    if (photos.length === 6) {
      return [
        {
          isPrimary: true,
          spreadSubIndex: 0,
          totalSubSpreads: 1,
          leftPhotos: [
            { photo: photos[0], idx: 0 },
            { photo: photos[1], idx: 1 },
            { photo: photos[2], idx: 2 },
          ],
          rightPhotos: [
            { photo: photos[3], idx: 3 },
            { photo: photos[4], idx: 4 },
            { photo: photos[5], idx: 5 },
          ],
        },
      ];
    }

    // 7+ photos: Multi-spread album
    const partitions: MemorySpreadPartition[] = [];
    partitions.push({
      isPrimary: true,
      spreadSubIndex: 0,
      totalSubSpreads: 1,
      leftPhotos: [
        { photo: photos[0], idx: 0 },
        { photo: photos[1], idx: 1 },
      ],
      rightPhotos: [
        { photo: photos[2], idx: 2 },
        { photo: photos[3], idx: 3 },
      ],
    });

    let currIdx = 4;
    let subIdx = 1;
    while (currIdx < photos.length) {
      const remaining = photos.length - currIdx;
      const count = Math.min(6, remaining);
      const leftCount = Math.ceil(count / 2);
      const rightCount = count - leftCount;

      const leftSlice = photos.slice(currIdx, currIdx + leftCount).map((p, i) => ({
        photo: p,
        idx: currIdx + i,
      }));
      currIdx += leftCount;

      const rightSlice = photos.slice(currIdx, currIdx + rightCount).map((p, i) => ({
        photo: p,
        idx: currIdx + i,
      }));
      currIdx += rightCount;

      partitions.push({
        isPrimary: false,
        spreadSubIndex: subIdx++,
        totalSubSpreads: 1,
        leftPhotos: leftSlice,
        rightPhotos: rightSlice,
      });
    }

    partitions.forEach((p) => {
      p.totalSubSpreads = partitions.length;
    });
    return partitions;
  }

  // Case 3: Long story text (paragraphs >= 2)
  if (photos.length <= 4) {
    return [
      {
        isPrimary: true,
        spreadSubIndex: 0,
        totalSubSpreads: 1,
        leftPhotos: [],
        rightPhotos: photos.map((p, idx) => ({ photo: p, idx })),
      },
    ];
  }

  // Long text with > 4 photos:
  const partitions: MemorySpreadPartition[] = [];
  const primaryCount = Math.min(4, photos.length);
  partitions.push({
    isPrimary: true,
    spreadSubIndex: 0,
    totalSubSpreads: 1,
    leftPhotos: [],
    rightPhotos: photos.slice(0, primaryCount).map((p, idx) => ({ photo: p, idx })),
  });

  let currIdx = primaryCount;
  let subIdx = 1;
  while (currIdx < photos.length) {
    const remaining = photos.length - currIdx;
    const count = Math.min(6, remaining);
    const leftCount = Math.ceil(count / 2);
    const rightCount = count - leftCount;

    const leftSlice = photos.slice(currIdx, currIdx + leftCount).map((p, i) => ({
      photo: p,
      idx: currIdx + i,
    }));
    currIdx += leftCount;

    const rightSlice = photos.slice(currIdx, currIdx + rightCount).map((p, i) => ({
      photo: p,
      idx: currIdx + i,
    }));
    currIdx += rightCount;

    partitions.push({
      isPrimary: false,
      spreadSubIndex: subIdx++,
      totalSubSpreads: 1,
      leftPhotos: leftSlice,
      rightPhotos: rightSlice,
    });
  }

  partitions.forEach((p) => {
    p.totalSubSpreads = partitions.length;
  });
  return partitions;
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
 * Distributes photos across left & right pages when text is short, ensuring clean non-overlapping coordinates.
 */
export function buildDefaultLayoutBlocks(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
): MemoryLayoutBlock[] {
  const blocks: MemoryLayoutBlock[] = [];
  const hasParas = Boolean(mem.paragraphs?.some((p) => p.trim()));
  const hasNote = Boolean(mem.note?.trim());
  const hasTitle = Boolean(mem.title?.trim() && mem.title.trim() !== "Encrypted Entry");
  let leftY = 5;
  let zCounter = 1;

  // Header (Date, Mood, Title) is ALWAYS present on Left page
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
  leftY += hasTitle ? 24 : 18;

  if (hasNote) {
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

  if (hasParas) {
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
    leftY += 36;
  }

  const photos = mem.photos || [];
  if (photos.length === 0) return blocks;

  const isPortraitAlbum = (mem as { albumStyle?: string }).albumStyle === "portrait" || photos.length === 1;
  const photoTilts = [-2, 2, -1.5, 2.5];

  // Up to 4 photos: ALL photos placed on side: "right" (the same page)
  if (photos.length === 1) {
    blocks.push(
      clampBlock({
        id: `photo-${photos[0].id}`,
        kind: "photo",
        photoId: photos[0].id,
        side: "right",
        x: 6,
        y: 8,
        w: 88,
        z: zCounter++,
        rotation: isPortraitAlbum ? 0 : photoTilts[0],
      }),
    );
  } else if (photos.length === 2) {
    blocks.push(
      clampBlock({
        id: `photo-${photos[0].id}`,
        kind: "photo",
        photoId: photos[0].id,
        side: "right",
        x: 5,
        y: 20,
        w: 43,
        z: zCounter++,
        rotation: isPortraitAlbum ? 0 : photoTilts[0],
      }),
    );
    blocks.push(
      clampBlock({
        id: `photo-${photos[1].id}`,
        kind: "photo",
        photoId: photos[1].id,
        side: "right",
        x: 52,
        y: 20,
        w: 43,
        z: zCounter++,
        rotation: isPortraitAlbum ? 0 : photoTilts[1],
      }),
    );
  } else if (photos.length === 3) {
    blocks.push(
      clampBlock({
        id: `photo-${photos[0].id}`,
        kind: "photo",
        photoId: photos[0].id,
        side: "right",
        x: 6,
        y: 6,
        w: 88,
        z: zCounter++,
        rotation: 0,
      }),
    );
    blocks.push(
      clampBlock({
        id: `photo-${photos[1].id}`,
        kind: "photo",
        photoId: photos[1].id,
        side: "right",
        x: 5,
        y: 50,
        w: 43,
        z: zCounter++,
        rotation: isPortraitAlbum ? 0 : photoTilts[1],
      }),
    );
    blocks.push(
      clampBlock({
        id: `photo-${photos[2].id}`,
        kind: "photo",
        photoId: photos[2].id,
        side: "right",
        x: 52,
        y: 50,
        w: 43,
        z: zCounter++,
        rotation: isPortraitAlbum ? 0 : photoTilts[2],
      }),
    );
  } else if (photos.length === 4) {
    // Clean 2x2 grid with all 4 photos together on the RIGHT page
    photos.forEach((photo, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      blocks.push(
        clampBlock({
          id: `photo-${photo.id}`,
          kind: "photo",
          photoId: photo.id,
          side: "right",
          x: col === 0 ? 5 : 52,
          y: 6 + row * 44,
          w: 43,
          z: zCounter++,
          rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
        }),
      );
    });
  } else {
    // 5+ photos: 2 on left, rest on right
    photos.forEach((photo, idx) => {
      const side: "left" | "right" = idx < 2 ? "left" : "right";
      if (side === "left") {
        const col = idx % 2;
        blocks.push(
          clampBlock({
            id: `photo-${photo.id}`,
            kind: "photo",
            photoId: photo.id,
            side: "left",
            x: col === 0 ? 5 : 52,
            y: Math.min(42, leftY + 2),
            w: 43,
            z: zCounter++,
            rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
          }),
        );
      } else {
        const slot = idx - 2;
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        blocks.push(
          clampBlock({
            id: `photo-${photo.id}`,
            kind: "photo",
            photoId: photo.id,
            side,
            x: col === 0 ? 5 : 52,
            y: 6 + row * 40,
            w: 43,
            z: zCounter++,
            rotation: isPortraitAlbum ? 0 : photoTilts[idx % photoTilts.length],
          }),
        );
      }
    });
  }

  return blocks;
}

/**
 * Automatically realigns memory blocks into a clean, level grid layout with 0° tilt and balanced margins.
 */
export function autoAlignMemoryBlocks(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos">,
): MemoryLayoutBlock[] {
  const blocks = buildDefaultLayoutBlocks(mem);
  return blocks.map((b) => ({
    ...b,
    rotation: 0,
  }));
}

/**
 * Reconciles saved custom blocks with current content/photos so added or removed photos stay in sync.
 * Automatically recovers from stale single-photo configurations or clashing block positions.
 */
export function syncLayoutBlocksWithMemory(
  mem: Pick<MemoryAlbum, "title" | "note" | "paragraphs" | "photos" | "layoutBlocks">,
): MemoryLayoutBlock[] {
  const fallback = buildDefaultLayoutBlocks(mem);
  const existing = mem.layoutBlocks;
  if (!Array.isArray(existing) || existing.length === 0) return fallback;

  // If existing blocks were saved without a header on left, restore clean layout with header
  const hasHeaderBlock = existing.some((b) => b.kind === "header");
  if (!hasHeaderBlock) {
    return fallback;
  }

  // If 4 photos were split 2-on-left and 2-on-right by the previous layout bug, restore all 4 on right
  const leftPhotos = existing.filter((b) => b.kind === "photo" && b.side === "left");
  const rightPhotos = existing.filter((b) => b.kind === "photo" && b.side === "right");
  if (mem.photos?.length === 4 && leftPhotos.length === 2 && rightPhotos.length === 2) {
    return fallback;
  }

  // If existing blocks were saved when there was only 1 photo, but now there are multiple, re-generate clean layout
  const existingPhotos = existing.filter((b) => b.kind === "photo");
  if (existingPhotos.length === 1 && (mem.photos?.length || 0) > 1) {
    return fallback;
  }

  // Detect overlapping blocks on same side from legacy bug
  const hasClashing = rightPhotos.some((a) =>
    rightPhotos.some((b) => a.id !== b.id && a.w > 60 && Math.abs(a.y - b.y) < 25),
  );
  if (hasClashing) {
    return fallback;
  }

  const fallbackById = new Map(fallback.map((b) => [b.id, b]));
  const result: MemoryLayoutBlock[] = [];
  const seen = new Set<string>();

  for (const raw of existing) {
    const valid =
      raw.kind === "photo"
        ? Boolean(raw.photoId && mem.photos?.some((p) => p.id === raw.photoId))
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

