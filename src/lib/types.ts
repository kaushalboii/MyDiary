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

export type DiaryBook = {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  yearLabel: string;
  coverImprint?: string;
  coverFooter?: string;
  spineMark?: string;
  description: string;
  quote: string;
  quoteBy: string;
  format: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  height: number;
  thickness: number;
  coverImage?: string;
  living?: boolean;
  memoryCount?: number;
  photoCount?: number;
  latestMemoryDate?: string | null;
  latestMemoryTitle?: string | null;
};

export type AlbumStyle = "polaroid" | "grid" | "filmstrip";

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
  createdAt: string;
  updatedAt: string;
};

export type StorageConfig = {
  serverUrl: string;
  token: string;
  label: string;
};

export type StorageHealth = {
  ok: boolean;
  service: string;
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  authRequired: boolean;
  tokenAuthorized: boolean;
  dataDir: string;
  stats: {
    booksCount: number;
    memoriesCount: number;
    photosCount: number;
    uploadsBytes: number;
  };
};

export type StorageMode = "server" | "offline-fallback";
