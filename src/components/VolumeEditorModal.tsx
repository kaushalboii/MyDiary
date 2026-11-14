"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Heart,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  LogOut,
  PenLine,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  formatBookPageNumber,
  getBookFontCss,
  getBookPageStyleVars,
  getBookPaperCss,
  getPageAccentColor,
  hasMemoryContent,
} from "@/lib/memory-layout";
import {
  AUTH_REQUIRED_EVENT,
  createBookInvitePayload,
  createMemory,
  getCachedUser,
  resolveMediaUrl,
  uploadPhotos,
  type BookPatchInput,
} from "@/lib/storage-client";
import type {
  AlbumPhoto,
  AlbumStyle,
  BookFontStyle,
  BookMotif,
  CoverTemplate,
  DiaryBook,
  MemoryMood,
  PageHeaderStyle,
  PageNumberStyle,
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

type ClothPreset = {
  name: string;
  group: "soft" | "bold";
  cover: string;
  secondary: string;
  accent: string;
  ink: string;
};

function autoContrastInk(hex: string): string {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#1F1C18";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#1F1C18" : "#F7F3EA";
}

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
    id: "portrait",
    name: "Wedding Album",
    desc: "Border-free fine art portraits & luxury multi-photo spreads",
  },
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

const CLOTH_PRESETS: ClothPreset[] = [
  // Curated light pastels & calm memory-psychology editorial palettes (first so changing colors is instant)
  { name: "Warm Oat Linen", group: "soft", cover: "#EAE0CE", secondary: "#B86B4B", accent: "#8E4B32", ink: "#261E18" },
  { name: "Peach Terracotta", group: "soft", cover: "#DFA189", secondary: "#FAF1E6", accent: "#7D3E2B", ink: "#2B1914" },
  { name: "Matcha Pastel", group: "soft", cover: "#B8C7A8", secondary: "#F2F5EC", accent: "#3E583C", ink: "#1E2B1D" },
  { name: "Powder Sky Blue", group: "soft", cover: "#9EC0D1", secondary: "#F0F6F9", accent: "#285069", ink: "#162A36" },
  { name: "Honey Buttercream", group: "soft", cover: "#E6D29E", secondary: "#8F5A38", accent: "#6B3D24", ink: "#292014" },
  { name: "Dusty Peony Blush", group: "soft", cover: "#DFABB2", secondary: "#FAF0F2", accent: "#7B3040", ink: "#2E151C" },
  { name: "Cool Pebble Mist", group: "soft", cover: "#D6D8DC", secondary: "#4D5563", accent: "#9E533E", ink: "#1E2229" },
  { name: "Periwinkle Silk", group: "soft", cover: "#AAB9DF", secondary: "#F6F5FB", accent: "#3A4882", ink: "#1A2140" },
  { name: "Eucalyptus Sage", group: "soft", cover: "#587D6C", secondary: "#F3EFE5", accent: "#CE935B", ink: "#FAF8F2" },
  { name: "French Chambray", group: "soft", cover: "#537497", secondary: "#F1ECE3", accent: "#DFAC6F", ink: "#F8F6F0" },
  { name: "Rosewood Clay", group: "soft", cover: "#8A4F53", secondary: "#F2E9DF", accent: "#E0A47A", ink: "#FAF4EB" },
  { name: "Heather Plum", group: "soft", cover: "#715F88", secondary: "#F3EFF8", accent: "#E3B878", ink: "#FAF7FC" },
  // Richer deep linen tones
  { name: "Nordic Fjord", group: "bold", cover: "#446582", secondary: "#EEF1F5", accent: "#D99F59", ink: "#F6F8FB" },
  { name: "Espresso Bark", group: "bold", cover: "#3A322C", secondary: "#EFE6D8", accent: "#D47E58", ink: "#F7F1E8" },
  { name: "Moonlight Slate", group: "bold", cover: "#3E434C", secondary: "#E6E8ED", accent: "#B89EE0", ink: "#F3F5F8" },
  { name: "Sea-Glass Lagoon", group: "bold", cover: "#2D6F6D", secondary: "#EAF3F1", accent: "#DCC684", ink: "#F2FAF8" },
  { name: "Juniper Pine", group: "bold", cover: "#466858", secondary: "#EDF2ED", accent: "#CFA060", ink: "#F5F9F6" },
  { name: "Velvet Fig Plum", group: "bold", cover: "#6B394F", secondary: "#F4ECEF", accent: "#E0AE79", ink: "#FAF4F6" },
  { name: "Burnt Sienna", group: "bold", cover: "#9F5935", secondary: "#F6EFE6", accent: "#E0B46E", ink: "#FFF9F2" },
];

const COVER_TEMPLATES: Array<{ id: CoverTemplate; label: string; hint: string }> = [
  { id: "side-spine-band", label: "Quarter Binding", hint: "Left cloth band & rule" },
  { id: "bordered-plaque", label: "Framed Plaque", hint: "Centered paper label plate" },
  { id: "clean-minimal", label: "Clean Minimal", hint: "Thin inset frame & mark" },
  { id: "arch-frame", label: "Arch Frame", hint: "Soft museum archway" },
  { id: "top-header-band", label: "Header Cloth", hint: "Upper band title block" },
  { id: "sun-disc", label: "Sun Disc", hint: "Centered pastel circle" },
  { id: "horizon-rule", label: "Horizon Rules", hint: "Three quiet tapered lines" },
  { id: "split-band", label: "Two-Tone Band", hint: "Contrast lower band" },
  { id: "double-inset", label: "Double Frame", hint: "Nested mitered rectangle" },
  { id: "oval-medallion", label: "Oval Medallion", hint: "Heirloom elliptical plaque" },
  { id: "corner-brackets", label: "Corner Crop", hint: "Minimal corner brackets" },
  { id: "window-pane", label: "Window Pane", hint: "2×2 clean panel window" },
  { id: "quarter-block", label: "Corner Block", hint: "Lower quadrant + hairline" },
  { id: "bookmark-ribbon", label: "Silk Ribbon", hint: "Notched top bookmark strip" },
  { id: "diagonal-sash", label: "Diagonal Fold", hint: "Clean corner diagonal" },
  { id: "botanical-stem", label: "Botanical Stem", hint: "Minimalist pressed sprig" },
  { id: "catalog-ticket", label: "Library Ticket", hint: "Ruled index label card" },
  { id: "classic", label: "Classic Seal", hint: "Foil concentric motif" },
  { id: "stepped-plinth", label: "Stepped Plinth", hint: "Layered bottom terraces" },
  { id: "photo-card", label: "Photo Cover", hint: "Full-bleed custom image" },
];

const SPINE_STYLES: Array<{ id: SpineStyle; label: string }> = [
  { id: "top-cap", label: "Top Cap" },
  { id: "banded", label: "Banded" },
  { id: "twin-rings", label: "Twin Rings" },
  { id: "bordered", label: "Bordered" },
  { id: "classic", label: "Edge Stripe" },
  { id: "bottom-foot", label: "Bottom Foot" },
  { id: "minimal", label: "Clean Cloth" },
  { id: "center-pill", label: "Center Pill" },
];

const PAPER_STYLES: Array<{ id: PaperStyle; label: string; hint: string }> = [
  { id: "cream", label: "Smooth Archival", hint: "Clean unruled linen leaf" },
  { id: "lined", label: "Ruled Lines", hint: "Soft stationery lines" },
  { id: "margin-lined", label: "Margin Notebook", hint: "Left margin + ruled" },
  { id: "dotgrid", label: "Dot Grid", hint: "Discreet 5mm dots" },
  { id: "grid", label: "Fine Graph", hint: "Delicate square grid" },
  { id: "framed", label: "Framed Border", hint: "Classic journal margin" },
];

const PAGE_TINT_PRESETS = [
  { label: "Auto", hex: "" },
  { label: "Warm Linen", hex: "#F8F3E8" },
  { label: "Ivory Silk", hex: "#FCFBF7" },
  { label: "Parchment", hex: "#F1E8D6" },
  { label: "Mist Blue", hex: "#EDF3F7" },
  { label: "Sage Paper", hex: "#ECF3ED" },
  { label: "Blossom", hex: "#F8EEF0" },
  { label: "Night Slate", hex: "#23211E" },
];

const PAGE_INK_PRESETS = [
  { label: "Auto", hex: "" },
  { label: "Charcoal", hex: "#24211C" },
  { label: "Espresso", hex: "#3B2B22" },
  { label: "Navy Ink", hex: "#1E2E42" },
  { label: "Forest Ink", hex: "#22392E" },
  { label: "Plum Ink", hex: "#3D2235" },
  { label: "Warm Ivory", hex: "#EFE8DA" },
];

const PAGE_NUMBER_STYLES: Array<{ id: PageNumberStyle; label: string; sample: string }> = [
  { id: "classic", label: "Classic", sample: "p. 01" },
  { id: "roman", label: "Roman", sample: "i · ii" },
  { id: "minimal", label: "Minimal", sample: "01" },
  { id: "hidden", label: "Hidden", sample: "Off" },
];

const PAGE_HEADER_STYLES: Array<{ id: PageHeaderStyle; label: string }> = [
  { id: "minimal", label: "Minimal" },
  { id: "centered", label: "Centered" },
  { id: "ruled", label: "Double Ruled" },
  { id: "botanical", label: "Botanical" },
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

type EditorTab = "cover" | "wordings" | "collaborate" | "memory" | "size";

export function VolumeEditorModal({
  mode = "edit",
  book,
  shelfBooks = [],
  defaultInsertIndex,
  initialTab = "cover",
  open,
  onClose,
  onSave,
  onDelete,
  onMemoryCreated,
}: {
  mode?: "edit" | "create";
  book: DiaryBook;
  shelfBooks?: DiaryBook[];
  defaultInsertIndex?: number;
  initialTab?: EditorTab;
  open: boolean;
  onClose: () => void;
  onSave: (patch: BookPatchInput) => Promise<void>;
  onDelete?: (bookId: string) => Promise<void>;
  onMemoryCreated?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const initialSlot =
    mode === "create"
      ? (defaultInsertIndex ?? shelfBooks.length)
      : Math.max(
          0,
          shelfBooks.findIndex((b) => b.id === book.id),
        );

  const [tab, setTab] = useState<EditorTab>(mode === "create" ? "cover" : initialTab);

  useEffect(() => {
    if (open) {
      setTab(mode === "create" ? "cover" : initialTab);
      setMemorySuccess(null);
    }
  }, [open, initialTab, mode]);

  // Memory Composer Studio state (all-in-one studio)
  const memoryPhotoInputRef = useRef<HTMLInputElement>(null);
  const [memoryDate, setMemoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memoryMood, setMemoryMood] = useState<string>("Nostalgic");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryLocation, setMemoryLocation] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [memoryParagraphs, setMemoryParagraphs] = useState("");
  const [memoryPhotos, setMemoryPhotos] = useState<AlbumPhoto[]>([]);
  const [memoryCoverPhotoId, setMemoryCoverPhotoId] = useState<string | null>(null);
  const [memoryAlbumStyle, setMemoryAlbumStyle] = useState<AlbumStyle>("polaroid");
  const [memoryUploading, setMemoryUploading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memorySuccess, setMemorySuccess] = useState<string | null>(null);

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

  // Co-Author & Shared Book
  const [collaboratorEmail, setCollaboratorEmail] = useState<string>(() => {
    if (typeof book.collaboratorEmail === "string" && book.collaboratorEmail.trim()) {
      return book.collaboratorEmail.trim();
    }
    if (Array.isArray(book.collaborators) && book.collaborators.length > 0) {
      return book.collaborators[0] || "";
    }
    return "";
  });

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
  const [paletteFilter, setPaletteFilter] = useState<"soft" | "bold" | "all">("soft");
  const [autoInkOnCover, setAutoInkOnCover] = useState<boolean>(true);

  // Inside Page & Size / Placement
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(
    book.paperStyle || "cream",
  );
  const [fontStyle, setFontStyle] = useState<BookFontStyle>(
    book.fontStyle || "serif",
  );
  const [pageTint, setPageTint] = useState<string>(book.pageTint || "");
  const [pageInk, setPageInk] = useState<string>(book.pageInk || "");
  const [pageAccent, setPageAccent] = useState<string>(book.pageAccent || "");
  const [pageNumberStyle, setPageNumberStyle] = useState<PageNumberStyle>(
    book.pageNumberStyle || "classic",
  );
  const [pageHeaderStyle, setPageHeaderStyle] = useState<PageHeaderStyle>(
    book.pageHeaderStyle || "minimal",
  );
  const [previewView, setPreviewView] = useState<"cover" | "inside" | "back">("cover");
  const [height, setHeight] = useState<number>(book.height || 2.12);
  const [thickness, setThickness] = useState<number>(book.thickness || 0.24);
  const [width, setWidth] = useState<number>(book.width || 1.3);
  const [positionIndex, setPositionIndex] = useState<number>(initialSlot);

  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTitle(book.title || "");
    setShortTitle(book.shortTitle || book.title || "");
    setSubtitle(book.subtitle || "");
    setYearLabel(book.yearLabel || String(new Date().getFullYear()));
    setCoverImprint(book.coverImprint ?? "PERSONAL ARCHIVE");
    setCoverFooter(book.coverFooter ?? "");
    setSpineMark(book.spineMark ?? siteConfig.spineMark);
    setWelcomeNote(book.welcomeNote ?? "");
    setDescription(book.description || "");
    setQuote(book.quote || "");
    setQuoteBy(book.quoteBy || "");

    const initialCollab =
      typeof book.collaboratorEmail === "string" && book.collaboratorEmail.trim()
        ? book.collaboratorEmail.trim()
        : Array.isArray(book.collaborators) && book.collaborators.length > 0
        ? book.collaborators[0] || ""
        : "";
    setCollaboratorEmail(initialCollab);

    setCover(book.cover || "#EAE0CE");
    setSecondary(book.secondary || book.accent || "#B86B4B");
    setAccent(book.accent || "#8E4B32");
    setInk(book.ink || "#261E18");
    setMotif(book.motif || "lattice");
    setCoverTemplate(book.coverTemplate || (book.coverImage ? "photo-card" : "classic"));
    setSpineStyle(book.spineStyle || "banded");
    setCoverImage(book.coverImage || "");
    setShowCoverTextWithImage(book.showCoverTextWithImage ?? true);
    setLiving(Boolean(book.living));

    setPaperStyle(book.paperStyle || "cream");
    setFontStyle(book.fontStyle || "serif");
    setPageTint(book.pageTint || "");
    setPageInk(book.pageInk || "");
    setPageAccent(book.pageAccent || "");
    setPageNumberStyle(book.pageNumberStyle || "classic");
    setPageHeaderStyle(book.pageHeaderStyle || "minimal");
    setHeight(book.height || 2.12);
    setThickness(book.thickness || 0.24);
    setWidth(book.width || 1.3);
    setPositionIndex(initialSlot);
    setConfirmDelete(false);
    setError(null);
    setCopiedInvite(false);
  }, [open, book, initialSlot]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const buildCurrentPatch = useCallback((): BookPatchInput => {
    const cleanTitle = title.trim() || "Untitled Diary";
    const cleanSpine = syncSpineTitle ? cleanTitle : shortTitle.trim() || cleanTitle;
    return {
      title: cleanTitle,
      shortTitle: cleanSpine,
      subtitle: subtitle.trim(),
      yearLabel: yearLabel.trim() || String(new Date().getFullYear()),
      coverImprint: coverImprint.trim(),
      coverFooter: coverFooter.trim(),
      spineMark: spineMark.trim() || "I",
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
      pageTint,
      pageInk,
      pageAccent,
      pageNumberStyle,
      pageHeaderStyle,
      height,
      thickness,
      width,
      positionIndex,
      collaboratorEmail: collaboratorEmail.trim() ? collaboratorEmail.trim().toLowerCase() : null,
      collaborators: collaboratorEmail.trim() ? [collaboratorEmail.trim().toLowerCase()] : [],
      isShared: Boolean(collaboratorEmail.trim()),
    };
  }, [
    title,
    syncSpineTitle,
    shortTitle,
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
    coverImage,
    showCoverTextWithImage,
    living,
    paperStyle,
    fontStyle,
    pageTint,
    pageInk,
    pageAccent,
    pageNumberStyle,
    pageHeaderStyle,
    height,
    thickness,
    width,
    positionIndex,
    collaboratorEmail,
  ]);

  useEffect(() => {
    if (!open) {
      isLoadedRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      isLoadedRef.current = true;
    }, 450);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !isLoadedRef.current) return;
    setAutoSaveStatus("saving");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const patch = buildCurrentPatch();
        await onSave(patch);
        setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("idle");
      }
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [buildCurrentPatch, onSave, open]);

  if (!open || !mounted || typeof document === "undefined") return null;

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
    pageTint: pageTint || undefined,
    pageInk: pageInk || undefined,
    pageAccent: pageAccent || undefined,
    pageNumberStyle,
    pageHeaderStyle,
    height,
    thickness,
    width,
    collaboratorEmail: collaboratorEmail.trim() ? collaboratorEmail.trim().toLowerCase() : null,
    collaborators: collaboratorEmail.trim() ? [collaboratorEmail.trim().toLowerCase()] : [],
    isShared: Boolean(collaboratorEmail.trim()) || Boolean(book.isShared),
  };

  const currentUser = getCachedUser();
  const isOwner =
    !book.sharedBy &&
    (!book.ownerEmail ||
      (currentUser &&
        book.ownerEmail.toLowerCase().trim() === currentUser.email?.toLowerCase().trim()));

  async function handleCoverUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    setUploadingCover(true);
    setError(null);
    try {
      const res = await uploadPhotos([file], book?.id);
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

  async function handleMemoryPhotosSelected(fileList: FileList | null) {
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
    setMemoryUploading(true);
    try {
      const res = await uploadPhotos(imageFiles, book?.id);
      setMemoryPhotos((prev) => {
        const next = [...prev, ...res.files];
        if (!memoryCoverPhotoId && next[0]) setMemoryCoverPhotoId(next[0].id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setMemoryUploading(false);
    }
  }

  function updateMemoryPhotoCaption(photoId: string, caption: string) {
    setMemoryPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p)),
    );
  }

  function removeMemoryPhoto(photoId: string) {
    setMemoryPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      if (memoryCoverPhotoId === photoId) {
        setMemoryCoverPhotoId(next[0]?.id || null);
      }
      return next;
    });
  }

  async function handleSaveMemory() {
    const parsedParagraphs = memoryParagraphs
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (
      !hasMemoryContent({
        title: memoryTitle.trim(),
        note: memoryNote.trim(),
        paragraphs: parsedParagraphs,
        photos: memoryPhotos,
      })
    ) {
      setError("Add a title, note, journal paragraphs, or at least one photo.");
      return;
    }

    setError(null);
    setMemorySaving(true);
    try {
      await createMemory({
        bookId: book.id,
        title: memoryTitle.trim(),
        date: memoryDate,
        location: memoryLocation.trim(),
        mood: memoryMood,
        note: memoryNote.trim(),
        paragraphs: parsedParagraphs,
        photos: memoryPhotos,
        coverPhotoId: memoryCoverPhotoId || memoryPhotos[0]?.id || null,
        albumStyle: memoryAlbumStyle,
      });

      setMemorySuccess(`Memory entry bound successfully into ${book.title}!`);
      setMemoryTitle("");
      setMemoryNote("");
      setMemoryParagraphs("");
      setMemoryLocation("");
      setMemoryPhotos([]);
      setMemoryCoverPhotoId(null);
      onMemoryCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save memory.");
    } finally {
      setMemorySaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "memory") {
      await handleSaveMemory();
      return;
    }
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
        pageTint,
        pageInk,
        pageAccent,
        pageNumberStyle,
        pageHeaderStyle,
        height,
        thickness,
        width,
        positionIndex,
        collaboratorEmail: collaboratorEmail.trim() ? collaboratorEmail.trim().toLowerCase() : null,
        collaborators: collaboratorEmail.trim() ? [collaboratorEmail.trim().toLowerCase()] : [],
        isShared: Boolean(collaboratorEmail.trim()),
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

  const applyPreset = (preset: ClothPreset) => {
    setCover(preset.cover);
    setSecondary(preset.secondary);
    setAccent(preset.accent);
    setInk(preset.ink);
  };

  const visiblePresets =
    paletteFilter === "all"
      ? CLOTH_PRESETS
      : CLOTH_PRESETS.filter((p) => p.group === paletteFilter);

  const handleShufflePreset = () => {
    const pool = visiblePresets.length ? visiblePresets : CLOTH_PRESETS;
    const currentIdx = pool.findIndex(
      (p) =>
        p.cover.toLowerCase() === cover.toLowerCase() &&
        p.accent.toLowerCase() === accent.toLowerCase(),
    );
    const next = pool[(currentIdx + 1) % pool.length];
    if (next) applyPreset(next);
  };

  const handleSwapCoverAndBand = () => {
    const nextCover = secondary;
    const nextSecondary = cover;
    setCover(nextCover);
    setSecondary(nextSecondary);
    if (autoInkOnCover) setInk(autoContrastInk(nextCover));
  };

  const handleCoverHexChange = (value: string) => {
    setCover(value);
    if (autoInkOnCover && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
      setInk(autoContrastInk(value));
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Add new book" : `Customize ${book.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="stationery-card relative my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto p-5 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close book studio"
          className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Live Miniature Book Stage (Cover + Open Inside Pages + Back Cover) */}
        <div
          data-testid="studio-book-preview"
          className="mb-5 rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3.5 sm:p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pr-9">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="eyebrow m-0">
                  {mode === "create" ? "Add Volume to Shelf" : "Book Studio"}
                </p>
                {autoSaveStatus === "saving" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] animate-pulse">
                    <Cloud className="h-3 w-3 animate-spin" />
                    <span>Autosaving...</span>
                  </span>
                )}
                {autoSaveStatus === "saved" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>☁️ Autosaved to Cloud</span>
                  </span>
                )}
              </div>
              <h2
                className="m-0 truncate text-xl sm:text-2xl font-normal tracking-tight"
                style={{ fontFamily: "var(--serif)" }}
              >
                {previewBook.title}
              </h2>
            </div>

            <div className="inline-flex rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] p-0.5 text-[10px] font-semibold tracking-wider uppercase">
              {(
                [
                  { id: "cover", label: "Cover & Spine" },
                  { id: "inside", label: "Open Book Pages" },
                  { id: "back", label: "Back Cover" },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`preview-mode-${v.id}`}
                  onClick={() => setPreviewView(v.id)}
                  className={`rounded-full px-2.5 py-1 cursor-pointer transition ${
                    previewView === v.id
                      ? "bg-[var(--ink)] text-[var(--paper-light)]"
                      : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {previewView === "cover" && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-end gap-2.5">
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

                {/* Front Cover + Proportional Cream Page-Edge Depth */}
                <div className="flex items-end">
                  <BookMotifPreview book={previewBook} size="md" />
                  <div
                    aria-hidden="true"
                    className="hidden sm:block rounded-r-[2px] border border-l-0 border-black/15"
                    style={{
                      width: Math.max(6, Math.round(thickness * 34)),
                      height: 92,
                      background:
                        "repeating-linear-gradient(90deg, #F3EEE3 0px, #F3EEE3 1px, #E3DACB 1px, #E3DACB 2px)",
                    }}
                  />
                </div>
              </div>

              <div className="text-right text-xs text-[var(--ink-soft)] space-y-1">
                <div>
                  Slot #{positionIndex + 1} of {totalSlots} ·{" "}
                  {thickness <= 0.15 ? "Thin" : thickness >= 0.32 ? "Thick" : "Standard"}
                </div>
                <div>{COVER_TEMPLATES.find((t) => t.id === coverTemplate)?.label}</div>
                <button
                  type="button"
                  onClick={() => setPreviewView("inside")}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer hover:underline"
                >
                  <BookOpen className="h-3 w-3" />
                  <span>Peek Inside Pages</span>
                </button>
              </div>
            </div>
          )}

          {previewView === "inside" && (() => {
            const miniPaperCss = getBookPaperCss(previewBook);
            const miniPageVars = getBookPageStyleVars(previewBook);
            const miniFontCss = getBookFontCss(previewBook.fontStyle);
            const miniAccent = getPageAccentColor(previewBook);
            const framedMini = previewBook.paperStyle === "framed";
            const p1 = formatBookPageNumber(1, previewBook.pageNumberStyle);
            const p2 = formatBookPageNumber(2, previewBook.pageNumberStyle);
            return (
              <div
                data-testid="studio-inside-preview"
                className="relative mx-auto max-w-lg rounded-lg p-1.5 sm:p-2 shadow-md transition-colors"
                style={{
                  backgroundColor: cover,
                  fontFamily: miniFontCss,
                  ...miniPageVars,
                }}
              >
                {/* Miniature Ribbon Bookmark */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 right-5 z-20 h-5 w-2"
                  style={{
                    backgroundColor: miniAccent,
                    clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)",
                  }}
                />

                <div className="grid grid-cols-2 overflow-hidden rounded-[4px] border border-black/15">
                  {/* Left Miniature Page */}
                  <div
                    className="relative flex min-h-[154px] flex-col justify-between p-2.5 sm:p-3.5"
                    style={{
                      ...miniPaperCss,
                      boxShadow: "inset -10px 0 16px -12px rgba(0,0,0,0.22)",
                    }}
                  >
                    <div
                      className={
                        framedMini
                          ? "flex flex-1 flex-col justify-between rounded-xs border border-[var(--hairline)] p-2"
                          : "flex flex-1 flex-col justify-between"
                      }
                    >
                      <div
                        className={`text-[7px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-soft)] ${
                          pageHeaderStyle === "centered" ? "text-center" : ""
                        } ${pageHeaderStyle === "ruled" ? "border-b border-double border-[var(--hairline)] pb-1" : ""}`}
                      >
                        {coverImprint || "PERSONAL ARCHIVE"}
                      </div>

                      <div className="my-auto flex flex-col items-center py-2 text-center">
                        {pageHeaderStyle === "botanical" ? (
                          <div className="flex items-center gap-1 text-[9px]" style={{ color: miniAccent }}>
                            <span className="h-px w-3 bg-current opacity-50" />
                            <span>✦</span>
                            <span className="h-px w-3 bg-current opacity-50" />
                          </div>
                        ) : (
                          <div
                            className="h-1.5 w-1.5 rotate-45"
                            style={{ backgroundColor: miniAccent }}
                          />
                        )}
                        <div className="mt-1.5 text-sm italic text-[var(--page-ink)]">
                          {spineMark || "I"}
                        </div>
                        <div className="text-[8px] tracking-widest uppercase text-[var(--ink-soft)]">
                          {yearLabel}
                        </div>
                      </div>

                      <div className="text-[8px] italic text-[var(--ink-soft)]">{p1}</div>
                    </div>
                  </div>

                  {/* Right Miniature Page */}
                  <div
                    className="relative flex min-h-[154px] flex-col justify-between border-l border-black/10 p-2.5 sm:p-3.5"
                    style={{
                      ...miniPaperCss,
                      boxShadow: "inset 10px 0 16px -12px rgba(0,0,0,0.18)",
                    }}
                  >
                    <div
                      className={
                        framedMini
                          ? "flex flex-1 flex-col justify-between rounded-xs border border-[var(--hairline)] p-2"
                          : "flex flex-1 flex-col justify-between"
                      }
                    >
                      <div className={pageHeaderStyle === "centered" ? "text-center" : ""}>
                        <div className="text-xs sm:text-sm font-normal leading-tight text-[var(--page-ink)]">
                          {previewBook.title}
                        </div>
                        <p className="mt-1.5 mb-0 line-clamp-3 text-[9px] leading-relaxed text-[var(--page-ink-muted)]">
                          {welcomeNote.trim() ||
                            "Welcome to your quiet blank pages. Write whenever a day deserves keeping."}
                        </p>
                      </div>

                      {/* Mini Polaroid + Note Sample Card */}
                      <div className="my-2 flex items-center justify-between gap-2">
                        <div
                          className="flex-1 border-l-2 bg-black/5 px-1.5 py-1 text-[8px] italic text-[var(--page-ink)]"
                          style={{ borderLeftColor: miniAccent }}
                        >
                          “A memory saved…”
                        </div>
                        <div className="h-8 w-8 shrink-0 rotate-2 rounded-xs bg-white p-0.5 pb-2 shadow-xs ring-1 ring-black/10">
                          <div
                            className="h-full w-full"
                            style={{
                              background: `linear-gradient(135deg, ${cover}88, ${miniAccent}66)`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[8px] italic text-[var(--ink-soft)]">
                        <span>{yearLabel}</span>
                        <span>{p2}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {previewView === "back" && (
            <div className="mx-auto flex max-w-md items-center justify-between gap-4 rounded-lg border border-black/15 p-3.5 shadow-sm"
              style={{ backgroundColor: cover, color: ink }}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[9px] tracking-[0.2em] uppercase opacity-75">
                  Back Cover Edition
                </div>
                <p className="m-0 text-xs leading-relaxed opacity-90 line-clamp-3">
                  {description || "Private hardcover keepsake volume."}
                </p>
                {quote && (
                  <p className="m-0 pt-1 font-serif text-xs italic opacity-85">
                    “{quote}” {quoteBy ? `— ${quoteBy}` : ""}
                  </p>
                )}
              </div>
              <span
                className="h-14 w-1 shrink-0 rounded-full opacity-80"
                style={{ backgroundColor: accent }}
              />
            </div>
          )}
        </div>

        {/* Minimal Tabs */}
        <div
          className={`mb-5 grid ${mode === "create" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-5"} border border-[var(--hairline)] bg-[var(--paper)]`}
          role="tablist"
        >
          {(
            mode === "create"
              ? [
                  { id: "cover" as const, label: "Outer Look" },
                  { id: "wordings" as const, label: "Wordings & Page" },
                  { id: "collaborate" as const, label: "Co-Author" },
                  { id: "size" as const, label: "Size & Shelf Spot" },
                ]
              : [
                  { id: "cover" as const, label: "Outer Look" },
                  { id: "wordings" as const, label: "Wordings & Page" },
                  { id: "collaborate" as const, label: "Co-Author" },
                  { id: "memory" as const, label: "Write Memory" },
                  { id: "size" as const, label: "Size & Shelf Spot" },
                ]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setPreviewView(item.id === "wordings" || item.id === "memory" ? "inside" : "cover");
              }}
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

              {/* Easy 1-Click Colors right near the top */}
              <div className="border border-[var(--hairline)] bg-[var(--paper)] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: "soft", label: "Light & Soft" },
                        { id: "bold", label: "Rich Tones" },
                        { id: "all", label: "All" },
                      ] as const
                    ).map((grp) => (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => setPaletteFilter(grp.id)}
                        className={`px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase border cursor-pointer transition ${
                          paletteFilter === grp.id
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper-light)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {grp.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleShufflePreset}
                      className="inline-flex items-center gap-1 border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                      title="Try the next color palette"
                    >
                      <Shuffle className="h-3 w-3" />
                      <span>Try Next</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSwapCoverAndBand}
                      className="inline-flex items-center gap-1 border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                      title="Swap Cover & Band colors"
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      <span>Swap</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {visiblePresets.map((preset) => {
                    const isActive =
                      preset.cover.toLowerCase() === cover.toLowerCase() &&
                      preset.accent.toLowerCase() === accent.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs cursor-pointer transition ${
                          isActive
                            ? "border-[var(--ink)] bg-[var(--paper-light)] ring-1 ring-[var(--ink)] font-medium"
                            : "border-[var(--hairline)] bg-[var(--paper-light)]/60 hover:border-[var(--ink)]"
                        }`}
                      >
                        <span className="inline-flex items-center -space-x-1">
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full border border-black/20"
                            style={{ backgroundColor: preset.cover }}
                          />
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full border border-black/20"
                            style={{ backgroundColor: preset.secondary }}
                          />
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full border border-black/20"
                            style={{ backgroundColor: preset.accent }}
                          />
                        </span>
                        <span>{preset.name}</span>
                        {isActive && <Check className="h-3 w-3 text-[var(--accent)]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 border-t border-[var(--hairline)] pt-2.5">
                  {(
                    [
                      { label: "Cloth Cover", val: cover, onChange: handleCoverHexChange },
                      { label: "Band & Plaque", val: secondary, onChange: setSecondary },
                      { label: "Trim Accent", val: accent, onChange: setAccent },
                      { label: "Lettering Ink", val: ink, onChange: setInk },
                    ] as const
                  ).map((field) => (
                    <div key={field.label} className="space-y-1">
                      <span className="block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                        {field.label}
                      </span>
                      <div className="flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-1.5 py-1">
                        <input
                          type="color"
                          aria-label={field.label}
                          value={/^#[0-9a-fA-F]{6}$/.test(field.val) ? field.val : "#F3ECE0"}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          className="h-6 w-7 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                        />
                        <input
                          type="text"
                          aria-label={`${field.label} hex`}
                          value={field.val}
                          maxLength={7}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="w-full min-w-0 bg-transparent font-mono text-[11px] uppercase outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-[11px] text-[var(--ink-soft)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoInkOnCover}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAutoInkOnCover(next);
                      if (next && /^#[0-9a-fA-F]{6}$/.test(cover)) {
                        setInk(autoContrastInk(cover));
                      }
                    }}
                  />
                  <span>Auto-adjust lettering contrast when cloth cover changes</span>
                </label>
              </div>

              {/* Outer Cover Card Design */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Outer Cover Style
                </label>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
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
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {SPINE_STYLES.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setSpineStyle(sp.id)}
                        className={`border px-2 py-1.5 text-[11px] cursor-pointer ${
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

              {/* Enhanced Inside Paper, Colors & Typography */}
              <div className="space-y-4 border-t border-[var(--hairline)] pt-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                    <span>Inside Page Paper Style</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {PAPER_STYLES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaperStyle(p.id)}
                        className={`border px-2.5 py-2 text-left text-xs cursor-pointer transition ${
                          paperStyle === p.id
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border-[var(--hairline)] bg-[var(--paper)] hover:border-[var(--ink)]"
                        }`}
                      >
                        <div className="font-medium">{p.label}</div>
                        <div className="text-[10px] opacity-75">{p.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Paper Color & Contrast Ink */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-[var(--hairline)] bg-[var(--paper)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                        Page Paper Color
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          aria-label="Custom page paper color"
                          value={/^#[0-9a-fA-F]{6}$/.test(pageTint) ? pageTint : "#F8F3E8"}
                          onChange={(e) => setPageTint(e.target.value.toUpperCase())}
                          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                        />
                        {pageTint && (
                          <button
                            type="button"
                            onClick={() => setPageTint("")}
                            className="text-[10px] font-semibold uppercase text-[var(--accent)] cursor-pointer hover:underline"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAGE_TINT_PRESETS.map((preset) => {
                        const active =
                          (preset.hex === "" && !pageTint) ||
                          preset.hex.toLowerCase() === pageTint.toLowerCase();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setPageTint(preset.hex)}
                            className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] cursor-pointer ${
                              active
                                ? "border-[var(--ink)] bg-[var(--paper-light)] ring-1 ring-[var(--ink)] font-medium"
                                : "border-[var(--hairline)] bg-[var(--paper-light)]/70"
                            }`}
                          >
                            <span
                              className="h-3 w-3 rounded-full border border-black/20"
                              style={{
                                background: preset.hex
                                  ? preset.hex
                                  : "linear-gradient(135deg, #F8F3E8 50%, #24211E 50%)",
                              }}
                            />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border border-[var(--hairline)] bg-[var(--paper)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                        Page Ink & Accent Rule
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-soft)] cursor-pointer">
                          <span>Rule</span>
                          <input
                            type="color"
                            aria-label="Inside rule accent color"
                            value={
                              /^#[0-9a-fA-F]{6}$/.test(pageAccent)
                                ? pageAccent
                                : /^#[0-9a-fA-F]{6}$/.test(accent)
                                  ? accent
                                  : "#A64B32"
                            }
                            onChange={(e) => setPageAccent(e.target.value.toUpperCase())}
                            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                          />
                        </label>
                        {pageAccent && (
                          <button
                            type="button"
                            onClick={() => setPageAccent("")}
                            className="text-[10px] font-semibold uppercase text-[var(--accent)] cursor-pointer hover:underline"
                          >
                            Auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAGE_INK_PRESETS.map((preset) => {
                        const active =
                          (preset.hex === "" && !pageInk) ||
                          preset.hex.toLowerCase() === pageInk.toLowerCase();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setPageInk(preset.hex)}
                            className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] cursor-pointer ${
                              active
                                ? "border-[var(--ink)] bg-[var(--paper-light)] ring-1 ring-[var(--ink)] font-medium"
                                : "border-[var(--hairline)] bg-[var(--paper-light)]/70"
                            }`}
                          >
                            <span
                              className="h-3 w-3 rounded-full border border-black/20"
                              style={{
                                background: preset.hex
                                  ? preset.hex
                                  : "linear-gradient(135deg, #25221E 50%, #F2ECE0 50%)",
                              }}
                            />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Typography + Page Numbers + Header Ornament */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Inside Typography
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {FONT_STYLES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFontStyle(f.id)}
                          className={`border px-1.5 py-1.5 text-center text-[11px] cursor-pointer ${
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

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Page Numbering
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      {PAGE_NUMBER_STYLES.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => setPageNumberStyle(n.id)}
                          className={`border px-2 py-1.5 text-[11px] cursor-pointer ${
                            pageNumberStyle === n.id
                              ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                              : "border-[var(--hairline)] bg-[var(--paper)]"
                          }`}
                        >
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Header Ornament
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      {PAGE_HEADER_STYLES.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setPageHeaderStyle(h.id)}
                          className={`border px-2 py-1.5 text-[11px] cursor-pointer ${
                            pageHeaderStyle === h.id
                              ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-light)]"
                              : "border-[var(--hairline)] bg-[var(--paper)]"
                          }`}
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
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

          {tab === "collaborate" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
                      Co-Author & Shared Memory Book
                    </h3>
                  </div>
                  {collaboratorEmail.trim() && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Shared Volume
                    </span>
                  )}
                </div>
                <p className="mb-4 font-serif text-xs italic leading-relaxed text-[var(--ink-soft)]">
                  Connect two accounts to write memories and upload photos together into this exact book volume. Both of you can view entries, add photos, and see each other reading live with glowing green presence!
                </p>

                {!currentUser && (
                  <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">Sign in required for shared cloud books:</span>
                      <p className="mt-0.5 text-[11px] opacity-90">
                        Sign in with Google so this book is tied to your account and synced automatically to both profiles.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent(AUTH_REQUIRED_EVENT, {
                            detail: { message: "Sign in with Google to create and sync your co-authored diary." },
                          }),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1 text-[11px] font-medium text-[var(--paper-light)] hover:opacity-90 cursor-pointer shadow-xs"
                    >
                      Sign in with Google
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Co-Author input or active card */}
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      <span>Partner / Co-Author Google Email</span>
                      {collaboratorEmail.trim() ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 normal-case">
                          <Check className="h-3 w-3" />
                          {book.inviteStatus === "accepted" ? "Accepted & Active" : "Invited · Co-Author"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--ink-soft)] normal-case">
                          Optional · Private by default
                        </span>
                      )}
                    </label>

                    <div className="relative">
                      <input
                        type="email"
                        value={collaboratorEmail}
                        disabled={!isOwner && mode === "edit"}
                        onChange={(e) => setCollaboratorEmail(e.target.value)}
                        placeholder="e.g. partner@gmail.com"
                        className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm font-sans placeholder:italic placeholder:text-[var(--ink-soft)]/50 focus:border-[var(--ink)] focus:outline-none transition disabled:opacity-60"
                      />
                      {collaboratorEmail.trim() && isOwner && (
                        <button
                          type="button"
                          onClick={() => setCollaboratorEmail("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--accent)] hover:text-red-600 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-normal text-[var(--ink-soft)]">
                      Enter your partner&apos;s Google email. Leave blank to keep this volume strictly personal to your account.
                    </p>
                  </div>

                  {/* Active Co-Author Status Pill */}
                  {collaboratorEmail.trim() ? (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Connected Co-Author: {collaboratorEmail.trim()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCollaboratorEmail("")}
                          className="text-[10px] font-semibold uppercase text-red-600 hover:underline cursor-pointer"
                        >
                          Remove Co-Author
                        </button>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        Autosaved to cloud: this exact book is synchronized. When <strong className="font-semibold">{collaboratorEmail.trim()}</strong> signs in with Google, this volume will appear automatically on their shelf!
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-lg border border-[var(--hairline)] bg-[var(--paper)]/60 p-3 text-xs text-[var(--ink-soft)]">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--ink-soft)]/50" />
                      <div className="text-[11px] leading-relaxed">
                        Default books and volumes without a co-author email remain strictly private to your personal bookshelf.
                      </div>
                    </div>
                  )}

                  {/* Shareable Invite Link button */}
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--paper)]/80 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          Instant Shareable Invite Link
                        </div>
                        <div className="text-[11px] text-[var(--ink-soft)]">
                          Works across all browsers, accounts, incognito tabs, and phones.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const payload = createBookInvitePayload(previewBook);
                          const origin =
                            typeof window !== "undefined"
                              ? window.location.origin + window.location.pathname
                              : "";
                          const link = `${origin}?invite=${payload}`;
                          void navigator.clipboard.writeText(link);
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 2500);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3.5 py-1.5 text-xs font-medium text-[var(--paper-light)] hover:bg-[var(--walnut-deep)] transition cursor-pointer shadow-sm"
                      >
                        {copiedInvite ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Invite Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Invite Link</span>
                          </>
                        )}
                      </button>
                    </div>
                    {copiedInvite && (
                      <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Link copied to clipboard! Share it with your partner so they can immediately accept and place this volume on their shelf.
                      </p>
                    )}
                  </div>

                  {/* Creator / Collaborator details & locked status */}
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)]/50 p-3 space-y-2 text-xs text-[var(--ink-soft)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Created by:{" "}
                        <strong className="font-semibold text-[var(--ink)]">
                          {book.ownerEmail || book.sharedBy || currentUser?.email || "You (Owner)"}
                        </strong>
                      </span>
                      {isOwner ? (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          (You are the Book Creator)
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          (Invited Co-Author)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      🔒 <strong>Locked Preservation:</strong> Entries and photographs uploaded by both co-authors are permanently retained in this volume. Even if a collaborator leaves, the book&apos;s memories remain safe and will not be lost.
                    </p>
                  </div>

                  {/* Creator-Only Deletion vs Collaborator Leave */}
                  {mode === "edit" && onDelete && (
                    <div className="border-t border-[var(--hairline)] pt-3">
                      {!confirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--accent)] hover:text-red-600 transition cursor-pointer"
                        >
                          {isOwner ? (
                            <>
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete Volume (Creator Only)</span>
                            </>
                          ) : (
                            <>
                              <LogOut className="h-3.5 w-3.5" />
                              <span>Leave Shared Book</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] p-3 text-xs">
                          <span className="text-[var(--danger-ink)]">
                            {isOwner
                              ? `Permanently delete “${book.title}” and its shelf spot?`
                              : `Remove “${book.title}” from your shelf? Memories remain safe.`}
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
                              {isOwner ? "Delete Book" : "Leave Book"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

              {/* Delete / Leave Book option when editing & > 1 book exists */}
              {mode === "edit" && onDelete && shelfBooks.length > 1 && (
                <div className="border-t border-[var(--hairline)] pt-4">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--accent)] hover:text-red-600 cursor-pointer"
                    >
                      {isOwner ? (
                        <>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete Volume (Creator Only)</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Leave Shared Book</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] p-3">
                      <span className="text-xs text-[var(--danger-ink)]">
                        {isOwner
                          ? `Permanently delete “${book.title}” from shelf?`
                          : `Remove “${book.title}” from shelf? Memories stay safe.`}
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
                          {isOwner ? "Delete Book" : "Leave Book"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "memory" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-3.5">
                <p className="eyebrow m-0 text-[10px] text-[var(--accent)] font-semibold uppercase tracking-widest">
                  Memory Composer Studio
                </p>
                <h3
                  className="mt-1 text-base font-normal tracking-tight"
                  style={{ fontFamily: "var(--serif)" }}
                >
                  Write Memory into {previewBook.title}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                  Save notes, photographs, or journal paragraphs directly bound inside this notebook.
                </p>
              </div>

              {/* Memory Date & Mood */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Memory Date
                  </label>
                  <input
                    type="date"
                    value={memoryDate}
                    onChange={(e) => setMemoryDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Atmosphere & Mood
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMemoryMood(m)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition cursor-pointer ${
                          memoryMood === m
                            ? "bg-[var(--ink)] text-[var(--paper-light)]"
                            : "border border-[var(--hairline)] bg-[var(--paper-light)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Memory Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={memoryTitle}
                    onChange={(e) => setMemoryTitle(e.target.value)}
                    placeholder="e.g., Monsoon Walk by the Sea"
                    className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={memoryLocation}
                    onChange={(e) => setMemoryLocation(e.target.value)}
                    placeholder="e.g., Goa, India"
                    className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Keepsake Note */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Keepsake Note / Quote
                </label>
                <textarea
                  value={memoryNote}
                  onChange={(e) => setMemoryNote(e.target.value)}
                  rows={2}
                  placeholder="Write a quick note, a feeling from that day, a line someone said, or a tiny reminder you never want to forget..."
                  className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-3 text-xs font-serif leading-relaxed"
                />
              </div>

              {/* Journal Paragraphs */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Journal Paragraphs
                </label>
                <textarea
                  value={memoryParagraphs}
                  onChange={(e) => setMemoryParagraphs(e.target.value)}
                  rows={4}
                  placeholder="Write your deeper story or memory paragraphs here. Separate multiple paragraphs with a blank line..."
                  className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-3 text-xs font-serif leading-relaxed"
                />
              </div>

              {/* Photographs Upload & List */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Photographs & Moments ({memoryPhotos.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => memoryPhotoInputRef.current?.click()}
                    disabled={memoryUploading}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider hover:border-[var(--ink)] cursor-pointer"
                  >
                    {memoryUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3 w-3" />
                    )}
                    <span>{memoryUploading ? "Uploading..." : "Upload Photos"}</span>
                  </button>
                  <input
                    ref={memoryPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleMemoryPhotosSelected(e.target.files)}
                  />
                </div>

                {memoryPhotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-3">
                    {memoryPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative rounded-lg border border-[var(--hairline)] overflow-hidden bg-[var(--paper)]"
                      >
                        <img
                          src={resolveMediaUrl(photo.url)}
                          alt={photo.caption || "Photo"}
                          className="h-24 w-full object-cover"
                        />
                        <div className="p-1.5 space-y-1">
                          <input
                            type="text"
                            value={photo.caption}
                            onChange={(e) => updateMemoryPhotoCaption(photo.id, e.target.value)}
                            placeholder="Caption..."
                            className="w-full border-b border-[var(--hairline)] bg-transparent text-[10px] focus:outline-none"
                          />
                          <div className="flex items-center justify-between pt-0.5">
                            <button
                              type="button"
                              onClick={() => setMemoryCoverPhotoId(photo.id)}
                              title={memoryCoverPhotoId === photo.id ? "Volume cover photo" : "Set as cover photo"}
                              className={`text-[10px] inline-flex items-center gap-0.5 cursor-pointer ${
                                memoryCoverPhotoId === photo.id ? "text-amber-600 font-bold" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                              }`}
                            >
                              <Star className={`h-2.5 w-2.5 ${memoryCoverPhotoId === photo.id ? "fill-current" : ""}`} />
                              <span>{memoryCoverPhotoId === photo.id ? "Cover" : "Set Cover"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMemoryPhoto(photo.id)}
                              className="text-[var(--ink-soft)] hover:text-red-500 cursor-pointer"
                              title="Remove photo"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Album Style Selection */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Album Framing Style
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALBUM_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setMemoryAlbumStyle(st.id)}
                      className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                        memoryAlbumStyle === st.id
                          ? "border-[var(--ink)] bg-[var(--paper)] shadow-xs"
                          : "border-[var(--hairline)] bg-[var(--paper-light)] hover:border-[var(--ink-soft)]"
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{st.name}</div>
                      <div className="text-[9px] text-[var(--ink-soft)] leading-tight mt-0.5">
                        {st.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {memorySuccess && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 shrink-0" />
                {memorySuccess}
              </span>
              <button
                type="button"
                onClick={() => setMemorySuccess(null)}
                className="text-[10px] uppercase font-semibold underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-ink)]">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] pt-4">
            {mode === "edit" && onDelete && shelfBooks.length > 1 ? (
              <div>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--accent)] hover:text-red-600 transition cursor-pointer"
                  >
                    {isOwner ? (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete Volume</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Leave Shared Book</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--danger-bg)] p-2 text-xs">
                    <span className="text-[var(--danger-ink)]">
                      {isOwner
                        ? `Permanently delete “${book.title}”?`
                        : `Remove “${book.title}” from your shelf? (Memories stay locked)`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-0.5 text-xs cursor-pointer"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDelete()}
                      className="rounded-full bg-[var(--accent)] px-3 py-0.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      {isOwner ? "Delete" : "Leave"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={tab === "memory" ? memorySaving || memoryUploading : saving || uploadingCover}
                className="rounded-full bg-[var(--ink)] px-5 py-2 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)] disabled:opacity-50"
              >
                {tab === "memory"
                  ? memorySaving
                    ? "Saving Memory..."
                    : "Save Memory to Volume"
                  : saving
                    ? "Saving..."
                    : mode === "create"
                      ? "Place Book on Shelf"
                      : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
