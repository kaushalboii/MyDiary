import defaultBooksRaw from "../../storage-server/default-books.json";
import type { DiaryBook } from "./types";

export const defaultBooks: DiaryBook[] = defaultBooksRaw as DiaryBook[];
