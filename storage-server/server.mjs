import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = (process.env.DIARY_STORAGE_TOKEN || "").trim();
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "./data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "diary.json");
const DEFAULT_BOOKS_PATH = path.join(__dirname, "default-books.json");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadDefaultBooks() {
  return JSON.parse(fs.readFileSync(DEFAULT_BOOKS_PATH, "utf8"));
}

const CURRENT_SCHEMA_VERSION = 7;

const LEGACY_COVER_HEXES = new Set([
  // Early template seeds:
  "#8c3f3d", "#2c5a4b", "#b68036", "#233a5c", "#523a46", "#314c63",
  "#475e48", "#2d5168", "#1f2430", "#4d3556", "#8c5938", "#3a637c",
  "#6e404d", "#a6853c", "#4b695e", "#5b323d", "#335443", "#644459",
  "#263b5c", "#9e3d3a", "#c97458", "#c88d3a", "#265a7b",
  // dd8eeb5 / 2b50152 default shelf:
  "#6f2130", "#4d746d", "#e8ddc6", "#162c55", "#262421", "#d36e5d",
  "#626a49", "#76a9c5", "#25282a", "#4c3970", "#1d4fa8", "#bd5a34",
  "#d8bd8c", "#e6bc39", "#d7d8d4", "#e7e1d3", "#365943", "#9a8ab8",
  "#1c304b",
  // 199015c soft minimalism shelf:
  "#7f5256", "#7d9489", "#ebe3d4", "#536678", "#45403b", "#c68c7b",
  "#8f977f", "#a3bcc9", "#585a5c", "#837991", "#607793", "#dfd3bd",
  "#b98c86", "#e7dbb9", "#d4d0c7", "#eae3d5", "#657f70", "#a99db3",
  "#4b5d73",
  // 5037200 vibrant soft shelf:
  "#a63a3e", "#246b5b", "#d99326", "#26538d", "#c85a3b", "#db6f57",
  "#568049", "#237887", "#262b3d", "#6b4573", "#c97a2b", "#347ea3",
  "#b54865", "#e0a938", "#3f8f7b", "#6e2c40", "#2d5e43", "#7d4a6b",
  "#2f4b7c",
  // v5/v6 dark slots #7-#19 replaced by Light & Soft Minimal in v7:
  "#214d3a", "#0b1d26", "#161822", "#311847", "#eae4d7", "#0b4f54",
  "#1b1e26", "#c23b2b", "#dedcd6", "#11224e", "#0f2d24", "#5e1b3a",
  "#1e1b18",
]);

function isLegacyDefaultShelf(books) {
  if (!Array.isArray(books)) return false;
  if (
    books.length === 19 &&
    books[0]?.id === "memories-2022" &&
    books[18]?.id === "milestones-and-ascents" &&
    books.every((book) => LEGACY_COVER_HEXES.has(String(book?.cover || "").toLowerCase()))
  ) {
    return true;
  }
  if (
    books.length === 4 &&
    books[0]?.id === "memories-2022" &&
    books[1]?.id === "pocket-notes" &&
    books[2]?.id === "memories-2025" &&
    books[3]?.id === "current-diary"
  ) {
    return true;
  }
  return false;
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      books: loadDefaultBooks(),
      memories: [],
      updatedAt: new Date().toISOString(),
    };
    writeDbSync(initial);
    return initial;
  }
  const raw = fs.readFileSync(DB_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.memories)) {
    parsed.memories = [];
  }
  if (!Array.isArray(parsed.books) || parsed.books.length === 0) {
    parsed.books = loadDefaultBooks();
  }
  if ((parsed.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
    const freshDefaults = loadDefaultBooks();
    if (parsed.memories.length === 0 && isLegacyDefaultShelf(parsed.books)) {
      parsed.books = freshDefaults;
    } else {
      const byId = new Map(freshDefaults.map((b) => [b.id, b]));
      parsed.books = parsed.books.map((book) => {
        const nextDefault = byId.get(book.id);
        if (nextDefault && LEGACY_COVER_HEXES.has(String(book.cover || "").toLowerCase())) {
          return {
            ...book,
            cover: nextDefault.cover,
            secondary: nextDefault.secondary,
            accent: nextDefault.accent,
            ink: nextDefault.ink,
            coverTemplate: nextDefault.coverTemplate,
            spineStyle: nextDefault.spineStyle,
            motif: nextDefault.motif,
          };
        }
        return book;
      });
    }
    parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
    writeDbSync(parsed);
  }
  return parsed;
}

function writeDbSync(data) {
  const payload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: data.books,
    memories: data.memories,
    updatedAt: new Date().toISOString(),
  };
  const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
}

let writeQueue = Promise.resolve();
function mutateDb(mutator) {
  const task = writeQueue.then(async () => {
    const db = readDb();
    const result = await mutator(db);
    writeDbSync(db);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

function directorySizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      total += fs.statSync(path.join(dir, entry.name)).size;
    }
  }
  return total;
}

function enrichBooks(db) {
  const statsByBook = new Map();
  for (const memory of db.memories) {
    const prev = statsByBook.get(memory.bookId) || {
      memoryCount: 0,
      photoCount: 0,
      latestMemoryDate: null,
      latestMemoryTitle: null,
    };
    prev.memoryCount += 1;
    prev.photoCount += Array.isArray(memory.photos) ? memory.photos.length : 0;
    const candidateDate = memory.date || memory.createdAt;
    if (!prev.latestMemoryDate || candidateDate > prev.latestMemoryDate) {
      prev.latestMemoryDate = candidateDate;
      prev.latestMemoryTitle = memory.title;
    }
    statsByBook.set(memory.bookId, prev);
  }
  return db.books.map((book) => ({
    ...book,
    ...(statsByBook.get(book.id) || {
      memoryCount: 0,
      photoCount: 0,
      latestMemoryDate: null,
      latestMemoryTitle: null,
    }),
  }));
}

function normalizeParagraphs(input) {
  if (Array.isArray(input)) {
    return input.map((p) => String(p).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanupOrphanedUploads(db) {
  const referenced = new Set();
  for (const memory of db.memories) {
    for (const photo of memory.photos || []) {
      if (photo.filename) referenced.add(path.basename(photo.filename));
    }
  }
  for (const book of db.books || []) {
    if (typeof book.coverImage === "string" && book.coverImage.includes("/uploads/")) {
      const cleanName = path.basename(book.coverImage.split("?")[0]);
      if (cleanName) referenced.add(cleanName);
    }
  }
  if (!fs.existsSync(UPLOADS_DIR)) return;
  for (const file of fs.readdirSync(UPLOADS_DIR)) {
    if (!referenced.has(file)) {
      try {
        fs.unlinkSync(path.join(UPLOADS_DIR, file));
      } catch {
        // Ignore cleanup failures for missing files.
      }
    }
  }
}

const COVER_TEMPLATES = new Set([
  "classic",
  "clean-minimal",
  "bordered-plaque",
  "split-band",
  "photo-card",
]);
const SPINE_STYLES = new Set(["classic", "banded", "minimal", "bordered"]);
const PAPER_STYLES = new Set(["cream", "lined", "dotgrid", "framed"]);
const FONT_STYLES = new Set(["serif", "sans", "mono"]);

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Number(num.toFixed(3))));
}

function makeBookId(title, existingBooks) {
  const base =
    String(title || "volume")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "volume";
  const taken = new Set(existingBooks.map((b) => b.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function applyBookPatch(current, patch) {
  const nextTitle =
    typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : current.title;
  const nextShort =
    typeof patch.shortTitle === "string" && patch.shortTitle.trim()
      ? patch.shortTitle.trim()
      : typeof patch.title === "string" && patch.title.trim() && current.shortTitle === current.title
        ? nextTitle
        : current.shortTitle;

  return {
    ...current,
    title: nextTitle,
    shortTitle: nextShort,
    subtitle: typeof patch.subtitle === "string" ? patch.subtitle.trim() : current.subtitle,
    yearLabel: typeof patch.yearLabel === "string" ? patch.yearLabel.trim() : current.yearLabel,
    coverImprint:
      typeof patch.coverImprint === "string" ? patch.coverImprint.trim() : current.coverImprint,
    coverFooter:
      typeof patch.coverFooter === "string" ? patch.coverFooter.trim() : current.coverFooter,
    spineMark: typeof patch.spineMark === "string" ? patch.spineMark.trim() : current.spineMark,
    welcomeNote:
      typeof patch.welcomeNote === "string" ? patch.welcomeNote.trim() : current.welcomeNote,
    description:
      typeof patch.description === "string" ? patch.description.trim() : current.description,
    quote: typeof patch.quote === "string" ? patch.quote.trim() : current.quote,
    quoteBy: typeof patch.quoteBy === "string" ? patch.quoteBy.trim() : current.quoteBy,
    format: typeof patch.format === "string" && patch.format.trim() ? patch.format.trim() : current.format,
    cover: typeof patch.cover === "string" && patch.cover ? patch.cover : current.cover,
    secondary:
      typeof patch.secondary === "string" && patch.secondary ? patch.secondary : current.secondary,
    accent: typeof patch.accent === "string" && patch.accent ? patch.accent : current.accent,
    ink: typeof patch.ink === "string" && patch.ink ? patch.ink : current.ink,
    motif: typeof patch.motif === "string" && patch.motif ? patch.motif : current.motif,
    coverTemplate:
      typeof patch.coverTemplate === "string" && COVER_TEMPLATES.has(patch.coverTemplate)
        ? patch.coverTemplate
        : current.coverTemplate,
    spineStyle:
      typeof patch.spineStyle === "string" && SPINE_STYLES.has(patch.spineStyle)
        ? patch.spineStyle
        : current.spineStyle,
    paperStyle:
      typeof patch.paperStyle === "string" && PAPER_STYLES.has(patch.paperStyle)
        ? patch.paperStyle
        : current.paperStyle,
    fontStyle:
      typeof patch.fontStyle === "string" && FONT_STYLES.has(patch.fontStyle)
        ? patch.fontStyle
        : current.fontStyle,
    coverImage:
      patch.coverImage === "" || patch.coverImage === null
        ? undefined
        : typeof patch.coverImage === "string"
          ? patch.coverImage
          : current.coverImage,
    showCoverTextWithImage:
      typeof patch.showCoverTextWithImage === "boolean"
        ? patch.showCoverTextWithImage
        : current.showCoverTextWithImage,
    height:
      patch.height !== undefined
        ? clampNumber(patch.height, 1.5, 2.55, current.height)
        : current.height,
    thickness:
      patch.thickness !== undefined
        ? clampNumber(patch.thickness, 0.1, 0.55, current.thickness)
        : current.thickness,
    width:
      patch.width !== undefined
        ? clampNumber(patch.width, 1.0, 1.65, current.width ?? 1.3)
        : current.width,
    living: typeof patch.living === "boolean" ? patch.living : current.living,
  };
}

const app = express();

const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS || "*").trim();
const allowedOrigins =
  allowedOriginsRaw === "*"
    ? true
    : allowedOriginsRaw
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Diary-Token"],
  }),
);

app.use(express.json({ limit: "15mb" }));

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  },
  express.static(UPLOADS_DIR),
);

function requireAuth(req, res, next) {
  if (!TOKEN) return next();
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = String(req.headers["x-diary-token"] || "").trim();
  if (bearer === TOKEN || headerToken === TOKEN) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized: valid storage token required." });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".jpg";
    const stamp = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");
    cb(null, `${stamp}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 24,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed."));
      return;
    }
    cb(null, true);
  },
});

app.get("/api/health", (req, res) => {
  const db = readDb();
  const photosCount = db.memories.reduce(
    (sum, m) => sum + (Array.isArray(m.photos) ? m.photos.length : 0),
    0,
  );
  const tokenOk = !TOKEN || (() => {
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const headerToken = String(req.headers["x-diary-token"] || "").trim();
    return bearer === TOKEN || headerToken === TOKEN;
  })();

  res.json({
    ok: true,
    service: "mydiary-storage",
    schemaVersion: db.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSeconds: Math.round(process.uptime()),
    authRequired: Boolean(TOKEN),
    tokenAuthorized: tokenOk,
    dataDir: DATA_DIR,
    stats: {
      booksCount: db.books.length,
      memoriesCount: db.memories.length,
      photosCount,
      uploadsBytes: directorySizeBytes(UPLOADS_DIR),
    },
  });
});

app.get("/api/books", requireAuth, (_req, res) => {
  const db = readDb();
  res.json({ books: enrichBooks(db) });
});

app.post("/api/books", requireAuth, async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled Diary";
  const result = await mutateDb((db) => {
    const baseTemplate = {
      id: typeof body.id === "string" && body.id.trim() && !db.books.some((b) => b.id === body.id.trim())
        ? body.id.trim()
        : makeBookId(title, db.books),
      title,
      shortTitle: title,
      subtitle: "",
      yearLabel: String(new Date().getFullYear()),
      coverImprint: "PERSONAL ARCHIVE",
      coverFooter: "",
      spineMark: String(db.books.length + 1),
      welcomeNote: "Welcome to your new diary pages. Turn the leaf or write whenever you are ready.",
      description: "",
      quote: "",
      quoteBy: "",
      format: "Soft Linen Hardcover",
      cover: "#DCE8F5",
      secondary: "#B4CCE3",
      accent: "#2563EB",
      ink: "#19263B",
      motif: "lattice",
      coverTemplate: "split-band",
      spineStyle: "banded",
      paperStyle: "cream",
      fontStyle: "serif",
      height: 2.12,
      thickness: 0.24,
      width: 1.3,
    };
    const nextBook = applyBookPatch(baseTemplate, body);
    const rawPos = Number(body.positionIndex);
    const insertAt = Number.isFinite(rawPos)
      ? Math.min(db.books.length, Math.max(0, Math.round(rawPos)))
      : db.books.length;
    db.books.splice(insertAt, 0, nextBook);
    const books = enrichBooks(db);
    return {
      book: books.find((b) => b.id === nextBook.id),
      books,
    };
  });
  res.status(201).json(result);
});

app.put("/api/books/reorder", requireAuth, async (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
  if (!orderedIds || orderedIds.length === 0) {
    res.status(400).json({ error: "orderedIds array is required." });
    return;
  }
  const books = await mutateDb((db) => {
    const map = new Map(db.books.map((b) => [b.id, b]));
    const reordered = [];
    for (const id of orderedIds) {
      const found = map.get(String(id));
      if (found) {
        reordered.push(found);
        map.delete(String(id));
      }
    }
    for (const remaining of map.values()) {
      reordered.push(remaining);
    }
    db.books = reordered;
    return enrichBooks(db);
  });
  res.json({ books });
});

app.put("/api/books/:id", requireAuth, async (req, res) => {
  const bookId = req.params.id;
  const result = await mutateDb((db) => {
    const idx = db.books.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    const current = db.books[idx];
    const patch = req.body || {};
    const next = applyBookPatch(current, patch);
    db.books[idx] = next;

    if (typeof patch.positionIndex === "number" && Number.isFinite(patch.positionIndex)) {
      const targetIdx = Math.min(db.books.length - 1, Math.max(0, Math.round(patch.positionIndex)));
      if (targetIdx !== idx) {
        const [moved] = db.books.splice(idx, 1);
        db.books.splice(targetIdx, 0, moved);
      }
    }

    cleanupOrphanedUploads(db);
    const books = enrichBooks(db);
    return {
      book: books.find((b) => b.id === bookId),
      books,
    };
  });

  if (!result) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }
  res.json(result);
});

app.delete("/api/books/:id", requireAuth, async (req, res) => {
  const bookId = req.params.id;
  const result = await mutateDb((db) => {
    if (db.books.length <= 1) {
      return { error: "Keep at least one book on the shelf." };
    }
    const idx = db.books.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    db.books.splice(idx, 1);
    db.memories = db.memories.filter((m) => m.bookId !== bookId);
    cleanupOrphanedUploads(db);
    return { ok: true, books: enrichBooks(db) };
  });

  if (!result) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.get("/api/memories", requireAuth, (req, res) => {
  const db = readDb();
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
  const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const mood = typeof req.query.mood === "string" ? req.query.mood.trim() : "";

  let memories = [...db.memories];
  if (bookId) {
    memories = memories.filter((m) => m.bookId === bookId);
  }
  if (mood && mood !== "All") {
    memories = memories.filter((m) => m.mood === mood);
  }
  if (query) {
    memories = memories.filter((m) => {
      const haystack = [
        m.title,
        m.note,
        m.location,
        m.mood,
        ...(m.paragraphs || []),
        ...(m.photos || []).map((p) => p.caption || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  memories.sort((a, b) => {
    const left = `${b.date || ""}|${b.createdAt || ""}`;
    const right = `${a.date || ""}|${a.createdAt || ""}`;
    return left.localeCompare(right);
  });

  res.json({ memories });
});

app.get("/api/memories/:id", requireAuth, (req, res) => {
  const db = readDb();
  const memory = db.memories.find((m) => m.id === req.params.id);
  if (!memory) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  res.json({ memory });
});

app.post("/api/upload", requireAuth, upload.array("photos", 24), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const uploaded = files.map((file) => ({
    id: crypto.randomUUID(),
    filename: file.filename,
    url: `/uploads/${file.filename}`,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    caption: "",
  }));
  res.status(201).json({ files: uploaded });
});

app.post("/api/memories", requireAuth, async (req, res) => {
  const body = req.body || {};
  const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!bookId || !title) {
    res.status(400).json({ error: "bookId and title are required." });
    return;
  }

  const created = await mutateDb((db) => {
    if (!db.books.some((b) => b.id === bookId)) {
      return { error: "Selected book volume does not exist." };
    }
    const now = new Date().toISOString();
    const photos = Array.isArray(body.photos)
      ? body.photos.map((photo) => ({
          id: photo.id || crypto.randomUUID(),
          url: String(photo.url || ""),
          filename: String(photo.filename || ""),
          originalName: String(photo.originalName || ""),
          caption: typeof photo.caption === "string" ? photo.caption.trim() : "",
          size: typeof photo.size === "number" ? photo.size : undefined,
          mimeType: typeof photo.mimeType === "string" ? photo.mimeType : undefined,
        }))
      : [];

    const memory = {
      id: body.id || crypto.randomUUID(),
      bookId,
      title,
      date:
        typeof body.date === "string" && body.date.trim()
          ? body.date.trim()
          : now.slice(0, 10),
      location: typeof body.location === "string" ? body.location.trim() : "",
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : "Nostalgic",
      note: typeof body.note === "string" ? body.note.trim() : "",
      paragraphs: normalizeParagraphs(body.paragraphs),
      photos,
      coverPhotoId:
        typeof body.coverPhotoId === "string" && body.coverPhotoId
          ? body.coverPhotoId
          : photos[0]?.id || null,
      albumStyle:
        body.albumStyle === "grid" || body.albumStyle === "filmstrip"
          ? body.albumStyle
          : "polaroid",
      createdAt: now,
      updatedAt: now,
    };

    db.memories.push(memory);
    return { memory };
  });

  if (created.error) {
    res.status(404).json({ error: created.error });
    return;
  }
  res.status(201).json({ memory: created.memory });
});

app.put("/api/memories/:id", requireAuth, async (req, res) => {
  const memoryId = req.params.id;
  const body = req.body || {};

  const result = await mutateDb((db) => {
    const idx = db.memories.findIndex((m) => m.id === memoryId);
    if (idx === -1) return null;
    const current = db.memories[idx];
    const photos = Array.isArray(body.photos)
      ? body.photos.map((photo) => ({
          id: photo.id || crypto.randomUUID(),
          url: String(photo.url || ""),
          filename: String(photo.filename || ""),
          originalName: String(photo.originalName || ""),
          caption: typeof photo.caption === "string" ? photo.caption.trim() : "",
          size: typeof photo.size === "number" ? photo.size : undefined,
          mimeType: typeof photo.mimeType === "string" ? photo.mimeType : undefined,
        }))
      : current.photos;

    const updated = {
      ...current,
      bookId: typeof body.bookId === "string" && body.bookId.trim() ? body.bookId.trim() : current.bookId,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : current.title,
      date: typeof body.date === "string" && body.date.trim() ? body.date.trim() : current.date,
      location: typeof body.location === "string" ? body.location.trim() : current.location,
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : current.mood,
      note: typeof body.note === "string" ? body.note.trim() : current.note,
      paragraphs:
        body.paragraphs !== undefined ? normalizeParagraphs(body.paragraphs) : current.paragraphs,
      photos,
      coverPhotoId:
        typeof body.coverPhotoId === "string"
          ? body.coverPhotoId
          : photos.some((p) => p.id === current.coverPhotoId)
            ? current.coverPhotoId
            : photos[0]?.id || null,
      albumStyle:
        body.albumStyle === "polaroid" ||
        body.albumStyle === "grid" ||
        body.albumStyle === "filmstrip"
          ? body.albumStyle
          : current.albumStyle,
      updatedAt: new Date().toISOString(),
    };

    db.memories[idx] = updated;
    cleanupOrphanedUploads(db);
    return updated;
  });

  if (!result) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  res.json({ memory: result });
});

app.delete("/api/memories/:id", requireAuth, async (req, res) => {
  const memoryId = req.params.id;
  const deleted = await mutateDb((db) => {
    const idx = db.memories.findIndex((m) => m.id === memoryId);
    if (idx === -1) return false;
    db.memories.splice(idx, 1);
    cleanupOrphanedUploads(db);
    return true;
  });

  if (!deleted) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/sync", requireAuth, async (req, res) => {
  const { books = [], memories = [] } = req.body || {};
  const result = await mutateDb((db) => {
    let updatedBooks = 0;
    let addedMemories = 0;

    for (const incomingBook of Array.isArray(books) ? books : []) {
      if (!incomingBook?.id) continue;
      let normalizedCoverImage = incomingBook.coverImage;
      if (typeof normalizedCoverImage === "string" && normalizedCoverImage.startsWith("data:image/")) {
        const match = normalizedCoverImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          const rawExt = match[1].toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
          const filename = `cover-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${rawExt || "jpg"}`;
          fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(match[2], "base64"));
          normalizedCoverImage = `/uploads/${filename}`;
        }
      }
      const idx = db.books.findIndex((b) => b.id === incomingBook.id);
      if (idx !== -1) {
        db.books[idx] = applyBookPatch(db.books[idx], {
          ...incomingBook,
          coverImage: normalizedCoverImage,
        });
        updatedBooks += 1;
      } else {
        db.books.push(applyBookPatch(incomingBook, { coverImage: normalizedCoverImage }));
        updatedBooks += 1;
      }
    }

    const existingIds = new Set(db.memories.map((m) => m.id));
    for (const incomingMemory of Array.isArray(memories) ? memories : []) {
      if (!incomingMemory?.id || existingIds.has(incomingMemory.id)) continue;

      const photos = [];
      for (const photo of incomingMemory.photos || []) {
        if (typeof photo.url === "string" && photo.url.startsWith("data:image/")) {
          const match = photo.url.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
          if (match) {
            const rawExt = match[1].toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
            const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${rawExt || "jpg"}`;
            fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(match[2], "base64"));
            photos.push({
              ...photo,
              filename,
              url: `/uploads/${filename}`,
            });
            continue;
          }
        }
        photos.push(photo);
      }

      db.memories.push({ ...incomingMemory, photos });
      existingIds.add(incomingMemory.id);
      addedMemories += 1;
    }

    return { updatedBooks, addedMemories, totalMemories: db.memories.length };
  });

  res.json({ ok: true, ...result });
});

app.use((err, _req, res, _next) => {
  if (err) {
    res.status(400).json({ error: err.message || "Storage server request error" });
    return;
  }
  res.status(500).json({ error: "Unexpected storage server error" });
});

readDb();
app.listen(PORT, HOST, () => {
  console.log(`[mydiary-storage] running on http://${HOST}:${PORT} (data: ${DATA_DIR})`);
});
