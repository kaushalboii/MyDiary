export type BookMotif =
  | "lattice"
  | "corrosion"
  | "efficiency"
  | "network"
  | "boom"
  | "organization"
  | "schematic"
  | "flight"
  | "circuit"
  | "orbit"
  | "branches"
  | "wave"
  | "runner"
  | "gather"
  | "maze"
  | "fracture"
  | "continuum"
  | "windows"
  | "steps";

export type CoverTemplate =
  | "classic"
  | "clean-minimal"
  | "bordered-plaque"
  | "split-band"
  | "side-spine-band"
  | "arch-frame"
  | "top-header-band"
  | "sun-disc"
  | "horizon-rule"
  | "double-inset"
  | "oval-medallion"
  | "corner-brackets"
  | "window-pane"
  | "quarter-block"
  | "bookmark-ribbon"
  | "diagonal-sash"
  | "botanical-stem"
  | "catalog-ticket"
  | "stepped-plinth"
  | "photo-card";

export type SpineStyle =
  | "classic"
  | "banded"
  | "minimal"
  | "bordered"
  | "top-cap"
  | "bottom-foot"
  | "center-pill"
  | "twin-rings";

export type PaperStyle =
  | "cream"
  | "lined"
  | "margin-lined"
  | "dotgrid"
  | "grid"
  | "framed";

export type BookFontStyle = "serif" | "sans" | "mono";

export type PageNumberStyle = "classic" | "roman" | "minimal" | "hidden";

export type PageHeaderStyle = "minimal" | "centered" | "ruled" | "botanical";

export type DiaryBook = {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  yearLabel: string;
  coverImprint?: string;
  coverFooter?: string;
  spineMark?: string;
  welcomeNote?: string;
  description: string;
  quote: string;
  quoteBy: string;
  format: string;
  cover: string;
  accent: string;
  ink: string;
  secondary?: string;
  motif: BookMotif;
  coverTemplate?: CoverTemplate;
  spineStyle?: SpineStyle;
  paperStyle?: PaperStyle;
  fontStyle?: BookFontStyle;
  pageTint?: string;
  pageInk?: string;
  pageAccent?: string;
  pageNumberStyle?: PageNumberStyle;
  pageHeaderStyle?: PageHeaderStyle;
  showCoverTextWithImage?: boolean;
  height: number;
  thickness: number;
  width?: number;
  coverImage?: string;
  living?: boolean;
  memoryCount?: number;
  photoCount?: number;
  latestMemoryDate?: string | null;
  latestMemoryTitle?: string | null;
};

export type AlbumStyle = "portrait" | "polaroid" | "grid" | "filmstrip";

export type MemoryMood =
  | "Nostalgic"
  | "Joyful"
  | "Peaceful"
  | "Adventurous"
  | "Reflective"
  | "Grateful";

export type AlbumPhoto = {
  id: string;
  url: string;
  filename: string;
  originalName: string;
  caption: string;
  size?: number;
  mimeType?: string;
};

export type MemoryBlockKind = "header" | "note" | "text" | "photo";

export type MemoryLayoutBlock = {
  id: string;
  kind: MemoryBlockKind;
  photoId?: string;
  side: "left" | "right";
  x: number;
  y: number;
  w: number;
  z?: number;
  rotation?: number;
};

export type MemoryAlbum = {
  id: string;
  bookId: string;
  title: string;
  date: string;
  location: string;
  mood: MemoryMood | string;
  note: string;
  paragraphs: string[];
  photos: AlbumPhoto[];
  coverPhotoId: string | null;
  albumStyle: AlbumStyle;
  layoutBlocks?: MemoryLayoutBlock[];
  encrypted?: boolean;
  ciphertext?: string;
  iv?: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageConfig = {
  serverUrl: string;
  token: string;
  label: string;
};

export type UserRole = "owner" | "member";
export type UserStatus = "active" | "pending" | "suspended";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type AuthStatusResponse = {
  ok: boolean;
  needsOwnerSetup: boolean;
  accountRequired: boolean;
  needsSetupToken: boolean;
  registrationMode: "invite-or-approval" | "invite-only";
  authenticated: boolean;
  user: AuthUser | null;
};

export type MemberSummary = AuthUser & {
  booksCount: number;
  memoriesCount: number;
};

export type InviteSummary = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
};

export type CreatedInvite = InviteSummary & {
  code: string;
};

export type StorageHealth = {
  ok: boolean;
  service: string;
  schemaVersion?: number;
  authRequired: boolean;
  tokenAuthorized: boolean;
  needsOwnerSetup?: boolean;
  accountRequired?: boolean;
  user?: AuthUser | null;
};

export type StorageMode = "server" | "offline-fallback";
