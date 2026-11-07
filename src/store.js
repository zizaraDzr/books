import { FORMATS, dedupeBooks, normalizeSpaces } from "./domain.js";

export const KEY = "books:v1";
const VERSION = 1;

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= 1900 && year <= 2100 ? year : null;
}

export function normalizeBook(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = normalizeSpaces(raw.title);
  if (!title) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : newId(),
    title,
    author: typeof raw.author === "string" ? normalizeSpaces(raw.author) : "",
    format: FORMATS.includes(raw.format) ? raw.format : "unknown",
    year: parseYear(raw.year),
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
  };
}

export function saveBooks(storage, books) {
  try {
    storage.setItem(KEY, JSON.stringify({ version: VERSION, books }));
    return true;
  } catch {
    return false;
  }
}

export function loadBooks(storage, seed = []) {
  let raw = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    raw = null;
  }

  if (raw !== null) {
    try {
      const data = JSON.parse(raw);
      const list = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : null;
      if (list) {
        const books = list.map(normalizeBook).filter(Boolean);
        if (books.length || list.length === 0) return { books, seeded: false };
      }
    } catch {
      // fall through to seed
    }
    try {
      storage.setItem(`${KEY}:broken`, raw);
    } catch {
      // best effort only
    }
  }

  const books = seed
    .map((book, index) =>
      normalizeBook({
        ...book,
        id: book?.id ?? `seed-${index + 1}`,
        addedAt: Number.isFinite(book?.addedAt) ? book.addedAt : index,
      }),
    )
    .filter(Boolean);
  saveBooks(storage, books);
  return { books, seeded: true };
}

export function addBook(books, value, { id = newId(), addedAt = Date.now() } = {}) {
  return [...books, { id, ...value, addedAt }];
}

export function updateBook(books, id, value) {
  return books.map((book) =>
    book.id === id ? { ...book, ...value, id: book.id, addedAt: book.addedAt } : book,
  );
}

export function removeBook(books, id) {
  const index = books.findIndex((book) => book.id === id);
  if (index === -1) return { books, removed: null, index: -1 };
  const removed = books[index];
  return { books: books.filter((book) => book.id !== id), removed, index };
}

export function restoreBook(books, book, index) {
  const without = books.filter((item) => item.id !== book.id);
  const at = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, at), book, ...without.slice(at)];
}

export function toExport(books) {
  return {
    app: "prochitano",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    books,
  };
}

export function fromExport(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : null;
  if (!list) throw new Error("Некорректный файл: не найден список книг");
  if (!list.length) throw new Error("В файле нет книг");

  const seen = new Set();
  const normalized = list
    .map((raw, index) =>
      normalizeBook({
        ...raw,
        addedAt: Number.isFinite(raw?.addedAt) ? raw.addedAt : index,
      }),
    )
    .filter(Boolean)
    .map((book) => {
      if (!seen.has(book.id)) {
        seen.add(book.id);
        return book;
      }
      return { ...book, id: newId() };
    });

  const books = dedupeBooks(normalized);
  if (!books.length) throw new Error("В файле нет книг с названиями");
  return { books, skipped: list.length - books.length };
}
