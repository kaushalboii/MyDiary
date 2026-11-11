import { defaultBooks } from "./default-books";
import type {
  AlbumPhoto,
  AlbumStyle,
  DiaryBook,
  MemoryAlbum,
  StorageConfig,
  StorageHealth,
  StorageMode,
} from "./types";

const CONFIG_KEY = "mydiary_storage_config_v1";
const IDB_NAME = "mydiary_offline_fallback_v1";
const IDB_VERSION = 1;

export const DEFAULT_STORAGE_URL =
  "https://4321-agq2i7yzuidu26jymgrfnit3ea.instabox.tech";

function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url.trim());
}

function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  );
}

export function getDefaultStorageConfig(): StorageConfig {
  const envUrl = (process.env.NEXT_PUBLIC_STORAGE_URL || "").trim();
  const envToken = (process.env.NEXT_PUBLIC_STORAGE_TOKEN || "").trim();
  return {
    serverUrl: normalizeServerUrl(envUrl || DEFAULT_STORAGE_URL),
    token: envToken || "",
    label: "kaushals-mini-server",
  };
}

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function loadStorageConfig(): StorageConfig {
  const defaults = getDefaultStorageConfig();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StorageConfig>;
    const candidate = normalizeServerUrl(parsed.serverUrl || defaults.serverUrl);
    const serverUrl =
      !isLocalBrowserHost() && isLoopbackUrl(candidate)
        ? defaults.serverUrl
        : candidate;
    return {
      serverUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      label: typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : defaults.label,
    };
  } catch {
    return defaults;
  }
}

export function saveStorageConfig(config: StorageConfig) {
  if (typeof window === "undefined") return;
  const normalized: StorageConfig = {
    serverUrl: normalizeServerUrl(config.serverUrl),
    token: config.token.trim(),
    label: config.label.trim() || "kaushals-mini-server",
  };
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed", { detail: normalized }));
}

export function resolveMediaUrl(url: string, config = loadStorageConfig()): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:") || /^https?:\/\//i.test(url)) {
    return url;
  }
  const base = normalizeServerUrl(config.serverUrl);
  if (!base) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function authHeaders(config: StorageConfig): HeadersInit {
  const headers: Record<string, string> = {};
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
    headers["X-Diary-Token"] = config.token;
  }
  return headers;
}

async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
  config = loadStorageConfig(),
): Promise<T> {
  const base = normalizeServerUrl(config.serverUrl);
  if (!base) throw new Error("No storage server URL configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...authHeaders(config),
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      let message = `Storage server responded with ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // Ignore parse failure
      }
      throw new Error(message);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// --- IndexedDB Offline Fallback (only used when remote/local server is unreachable) ---

function openFallbackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("memories")) {
        db.createObjectStore("memories", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFromStore<T>(storeName: "books" | "memories"): Promise<T[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: "books" | "memories", value: T): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: "books" | "memories", id: string): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const OFFLINE_BOOK_ORDER_KEY = "mydiary_offline_book_order_v2";

function loadOfflineOrder(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_BOOK_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function saveOfflineOrder(orderedIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFLINE_BOOK_ORDER_KEY, JSON.stringify(orderedIds));
  } catch {
    // Ignore storage quota issues
  }
}

async function seedOfflineBooksIfEmpty(): Promise<DiaryBook[]> {
  const existing = await getAllFromStore<DiaryBook>("books");
  if (existing.length > 0) return existing;
  for (const b of defaultBooks) {
    await putInStore("books", b);
  }
  saveOfflineOrder(defaultBooks.map((b) => b.id));
  return defaultBooks.map((b) => ({ ...b }));
}

async function getOfflineBooks(): Promise<DiaryBook[]> {
  let storedBooks = await getAllFromStore<DiaryBook>("books");
  const storedMemories = await getAllFromStore<MemoryAlbum>("memories");
  const order = loadOfflineOrder();

  if (storedBooks.length === 0 && !order) {
    storedBooks = await seedOfflineBooksIfEmpty();
  }

  const bookMap = new Map<string, DiaryBook>();
  storedBooks.forEach((b) => bookMap.set(b.id, { ...b }));
  if (!order) {
    defaultBooks.forEach((b) => {
      if (!bookMap.has(b.id)) bookMap.set(b.id, { ...b });
    });
  }

  const stats = new Map<
    string,
    {
      memoryCount: number;
      photoCount: number;
      latestMemoryDate: string | null;
      latestMemoryTitle: string | null;
    }
  >();

  for (const m of storedMemories) {
    const curr = stats.get(m.bookId) || {
      memoryCount: 0,
      photoCount: 0,
      latestMemoryDate: null,
      latestMemoryTitle: null,
    };
    curr.memoryCount += 1;
    curr.photoCount += m.photos.length;
    const candidate = m.date || m.createdAt;
    if (!curr.latestMemoryDate || candidate > curr.latestMemoryDate) {
      curr.latestMemoryDate = candidate;
      curr.latestMemoryTitle = m.title;
    }
    stats.set(m.bookId, curr);
  }

  const orderedIds = order
    ? [...order, ...Array.from(bookMap.keys()).filter((id) => !order.includes(id))]
    : Array.from(bookMap.keys());

  const result: DiaryBook[] = [];
  for (const id of orderedIds) {
    const resolved = bookMap.get(id);
    if (!resolved) continue;
    result.push({
      ...resolved,
      ...(stats.get(id) || {
        memoryCount: 0,
        photoCount: 0,
        latestMemoryDate: null,
        latestMemoryTitle: null,
      }),
    });
  }
  if (result.length === 0) {
    return defaultBooks.map((b) => ({
      ...b,
      ...(stats.get(b.id) || {
        memoryCount: 0,
        photoCount: 0,
        latestMemoryDate: null,
        latestMemoryTitle: null,
      }),
    }));
  }
  return result;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// --- Public API ---

export async function checkStorageHealth(
  customConfig?: StorageConfig,
): Promise<StorageHealth> {
  return serverFetch<StorageHealth>("/api/health", {}, customConfig);
}

export async function fetchBooks(): Promise<{
  books: DiaryBook[];
  mode: StorageMode;
  hostname?: string;
}> {
  const config = loadStorageConfig();
  try {
    const [booksData, health] = await Promise.all([
      serverFetch<{ books: DiaryBook[] }>("/api/books", {}, config),
      checkStorageHealth(config).catch(() => null),
    ]);
    return {
      books: booksData.books,
      mode: "server",
      hostname: health?.hostname,
    };
  } catch {
    const books = await getOfflineBooks();
    return { books, mode: "offline-fallback" };
  }
}

export type BookPatchInput = Partial<DiaryBook> & { positionIndex?: number };

export async function createBook(
  input: BookPatchInput,
): Promise<{ book: DiaryBook; books: DiaryBook[]; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ book: DiaryBook; books: DiaryBook[] }>("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return { book: res.book, books: res.books, mode: "server" };
  } catch {
    const books = await getOfflineBooks();
    const baseTitle = (input.title || "Untitled Diary").trim() || "Untitled Diary";
    const slugBase =
      baseTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "volume";
    const taken = new Set(books.map((b) => b.id));
    let id = slugBase;
    let n = 2;
    while (taken.has(id)) {
      id = `${slugBase}-${n}`;
      n += 1;
    }
    const { positionIndex, ...rest } = input;
    const book: DiaryBook = {
      id,
      title: baseTitle,
      shortTitle: input.shortTitle?.trim() || baseTitle,
      subtitle: input.subtitle?.trim() || "",
      yearLabel: input.yearLabel?.trim() || String(new Date().getFullYear()),
      coverImprint: input.coverImprint ?? "PERSONAL ARCHIVE",
      coverFooter: input.coverFooter ?? "",
      spineMark: input.spineMark ?? String(books.length + 1),
      welcomeNote:
        input.welcomeNote ??
        "Welcome to your new diary pages. Turn the leaf or write whenever you are ready.",
      description: input.description?.trim() || "",
      quote: input.quote?.trim() || "",
      quoteBy: input.quoteBy?.trim() || "",
      format: input.format || "Clothbound Hardcover",
      cover: input.cover || "#6f2130",
      accent: input.accent || "#d5a756",
      ink: input.ink || "#f4ead7",
      motif: input.motif || "lattice",
      coverTemplate: input.coverTemplate || "clean-minimal",
      spineStyle: input.spineStyle || "banded",
      paperStyle: input.paperStyle || "cream",
      fontStyle: input.fontStyle || "serif",
      height: input.height ?? 2.12,
      thickness: input.thickness ?? 0.24,
      width: input.width ?? 1.3,
      ...rest,
    };
    await seedOfflineBooksIfEmpty();
    await putInStore("books", book);
    const ids = books.map((b) => b.id);
    const insertAt =
      typeof positionIndex === "number" && Number.isFinite(positionIndex)
        ? Math.min(ids.length, Math.max(0, Math.round(positionIndex)))
        : ids.length;
    ids.splice(insertAt, 0, id);
    saveOfflineOrder(ids);
    const updatedList = await getOfflineBooks();
    return {
      book: updatedList.find((b) => b.id === id) || book,
      books: updatedList,
      mode: "offline-fallback",
    };
  }
}

export async function updateBook(
  bookId: string,
  patch: BookPatchInput,
): Promise<{ book: DiaryBook; books: DiaryBook[]; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ book: DiaryBook; books?: DiaryBook[] }>(
      `/api/books/${encodeURIComponent(bookId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const list = res.books ?? (await fetchBooks()).books;
    return { book: res.book, books: list, mode: "server" };
  } catch {
    await seedOfflineBooksIfEmpty();
    const books = await getOfflineBooks();
    const currentIdx = books.findIndex((b) => b.id === bookId);
    const existing =
      (currentIdx >= 0 ? books[currentIdx] : undefined) ||
      defaultBooks.find((b) => b.id === bookId);
    if (!existing) throw new Error("Book volume not found");
    const { positionIndex, ...rest } = patch;
    const updated = { ...existing, ...rest };
    await putInStore("books", updated);
    if (typeof positionIndex === "number" && Number.isFinite(positionIndex) && currentIdx >= 0) {
      const ids = books.map((b) => b.id);
      const targetIdx = Math.min(ids.length - 1, Math.max(0, Math.round(positionIndex)));
      if (targetIdx !== currentIdx) {
        const [moved] = ids.splice(currentIdx, 1);
        ids.splice(targetIdx, 0, moved);
        saveOfflineOrder(ids);
      }
    }
    const updatedList = await getOfflineBooks();
    return {
      book: updatedList.find((b) => b.id === bookId) || updated,
      books: updatedList,
      mode: "offline-fallback",
    };
  }
}

export async function reorderBooks(
  orderedIds: string[],
): Promise<{ books: DiaryBook[]; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ books: DiaryBook[] }>("/api/books/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    return { books: res.books, mode: "server" };
  } catch {
    await seedOfflineBooksIfEmpty();
    saveOfflineOrder(orderedIds);
    const books = await getOfflineBooks();
    return { books, mode: "offline-fallback" };
  }
}

export async function deleteBook(
  bookId: string,
): Promise<{ books: DiaryBook[]; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ books: DiaryBook[] }>(`/api/books/${encodeURIComponent(bookId)}`, {
      method: "DELETE",
    });
    return { books: res.books, mode: "server" };
  } catch {
    await seedOfflineBooksIfEmpty();
    const books = await getOfflineBooks();
    if (books.length <= 1) {
      throw new Error("Keep at least one book on the shelf.");
    }
    await deleteFromStore("books", bookId);
    const nextIds = books.map((b) => b.id).filter((id) => id !== bookId);
    saveOfflineOrder(nextIds);
    const memories = await getAllFromStore<MemoryAlbum>("memories");
    for (const m of memories) {
      if (m.bookId === bookId) {
        await deleteFromStore("memories", m.id);
      }
    }
    const updatedList = await getOfflineBooks();
    return { books: updatedList, mode: "offline-fallback" };
  }
}

export async function fetchMemories(params?: {
  bookId?: string;
  q?: string;
  mood?: string;
}): Promise<{ memories: MemoryAlbum[]; mode: StorageMode }> {
  const qs = new URLSearchParams();
  if (params?.bookId) qs.set("bookId", params.bookId);
  if (params?.q) qs.set("q", params.q);
  if (params?.mood && params.mood !== "All") qs.set("mood", params.mood);
  const query = qs.toString() ? `?${qs.toString()}` : "";

  try {
    const res = await serverFetch<{ memories: MemoryAlbum[] }>(`/api/memories${query}`);
    return { memories: res.memories, mode: "server" };
  } catch {
    let list = await getAllFromStore<MemoryAlbum>("memories");
    if (params?.bookId) list = list.filter((m) => m.bookId === params.bookId);
    if (params?.mood && params.mood !== "All") list = list.filter((m) => m.mood === params.mood);
    if (params?.q) {
      const needle = params.q.toLowerCase();
      list = list.filter((m) =>
        [m.title, m.note, m.location, m.mood, ...m.paragraphs, ...m.photos.map((p) => p.caption)]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    list.sort((a, b) => `${b.date}|${b.createdAt}`.localeCompare(`${a.date}|${a.createdAt}`));
    return { memories: list, mode: "offline-fallback" };
  }
}

export async function fetchMemory(
  memoryId: string,
): Promise<{ memory: MemoryAlbum | null; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ memory: MemoryAlbum }>(
      `/api/memories/${encodeURIComponent(memoryId)}`,
    );
    return { memory: res.memory, mode: "server" };
  } catch {
    const list = await getAllFromStore<MemoryAlbum>("memories");
    return {
      memory: list.find((m) => m.id === memoryId) || null,
      mode: "offline-fallback",
    };
  }
}

export async function uploadPhotos(
  files: File[],
): Promise<{ files: AlbumPhoto[]; mode: StorageMode }> {
  if (!files.length) return { files: [], mode: "server" };
  const config = loadStorageConfig();
  const base = normalizeServerUrl(config.serverUrl);

  try {
    if (!base) throw new Error("No server configured");
    const formData = new FormData();
    files.forEach((file) => formData.append("photos", file));

    const response = await fetch(`${base}/api/upload`, {
      method: "POST",
      headers: authHeaders(config),
      body: formData,
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Upload failed (${response.status})`);
    }
    const json = (await response.json()) as { files: AlbumPhoto[] };
    return { files: json.files, mode: "server" };
  } catch {
    const fallbackFiles: AlbumPhoto[] = await Promise.all(
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        url: await fileToDataUrl(file),
        filename: file.name,
        originalName: file.name,
        caption: "",
        size: file.size,
        mimeType: file.type,
      })),
    );
    return { files: fallbackFiles, mode: "offline-fallback" };
  }
}

export type SaveMemoryInput = {
  id?: string;
  bookId: string;
  title: string;
  date: string;
  location: string;
  mood: string;
  note: string;
  paragraphs: string[];
  photos: AlbumPhoto[];
  coverPhotoId: string | null;
  albumStyle: AlbumStyle;
};

export async function createMemory(
  input: SaveMemoryInput,
): Promise<{ memory: MemoryAlbum; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ memory: MemoryAlbum }>("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return { memory: res.memory, mode: "server" };
  } catch {
    const now = new Date().toISOString();
    const memory: MemoryAlbum = {
      ...input,
      id: input.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await putInStore("memories", memory);
    return { memory, mode: "offline-fallback" };
  }
}

export async function updateMemory(
  memoryId: string,
  input: Partial<SaveMemoryInput>,
): Promise<{ memory: MemoryAlbum; mode: StorageMode }> {
  try {
    const res = await serverFetch<{ memory: MemoryAlbum }>(
      `/api/memories/${encodeURIComponent(memoryId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return { memory: res.memory, mode: "server" };
  } catch {
    const list = await getAllFromStore<MemoryAlbum>("memories");
    const existing = list.find((m) => m.id === memoryId);
    if (!existing) throw new Error("Memory not found");
    const updated: MemoryAlbum = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    await putInStore("memories", updated);
    return { memory: updated, mode: "offline-fallback" };
  }
}

export async function deleteMemory(memoryId: string): Promise<{ mode: StorageMode }> {
  try {
    await serverFetch<{ ok: boolean }>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: "DELETE",
    });
    return { mode: "server" };
  } catch {
    await deleteFromStore("memories", memoryId);
    return { mode: "offline-fallback" };
  }
}

export async function getOfflineDraftCount(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const memories = await getAllFromStore<MemoryAlbum>("memories");
  return memories.length;
}

export async function syncOfflineToServer(
  customConfig?: StorageConfig,
): Promise<{ addedMemories: number; updatedBooks: number }> {
  const books = await getAllFromStore<DiaryBook>("books");
  const memories = await getAllFromStore<MemoryAlbum>("memories");
  const res = await serverFetch<{
    ok: boolean;
    addedMemories: number;
    updatedBooks: number;
  }>(
    "/api/sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ books, memories }),
    },
    customConfig,
  );
  return { addedMemories: res.addedMemories, updatedBooks: res.updatedBooks };
}
