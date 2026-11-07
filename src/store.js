import { dedupeBooks, normalizeSpaces } from "./domain.js";

export const KEY = "books:v2";
export const LEGACY_KEY = "books:v1";
const VERSION = 2;

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

function parseNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function normalizeBook(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = normalizeSpaces(raw.title);
  if (!title) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : newId(),
    number: parseNumber(raw.number),
    title,
    author: typeof raw.author === "string" ? normalizeSpaces(raw.author) : "",
    format: raw.format === "audio" ? "audio" : "book",
    year: parseYear(raw.year),
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
  };
}

function seedNumbers(seed) {
  const numbers = new Map();
  for (const raw of seed) {
    const book = normalizeBook(raw);
    if (book?.number) numbers.set(book.id, book.number);
  }
  return numbers;
}

function assignNumbers(books, seed) {
  const known = seedNumbers(seed);
  const hasSeed = books.some((book) => known.has(book.id));
  let next = (hasSeed ? Math.max(0, ...known.values()) : 0) + 1;
  const used = new Set();

  for (const book of books) {
    let number = book.number ?? known.get(book.id) ?? null;
    if (number && used.has(number)) number = null;
    if (number) used.add(number);
    book.number = number;
  }

  if (used.size) next = Math.max(next, Math.max(...used) + 1);

  for (const book of books) {
    if (book.number) continue;
    while (used.has(next)) next += 1;
    book.number = next;
    used.add(next);
    next += 1;
  }

  return books;
}

export function saveBooks(storage, books) {
  try {
    storage.setItem(KEY, JSON.stringify({ version: VERSION, books }));
    return true;
  } catch {
    return false;
  }
}

function readList(storage, key) {
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { raw: null, list: null };
  }
  if (raw === null) return { raw: null, list: null };

  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : null;
    return { raw, list };
  } catch {
    return { raw, list: null };
  }
}

export function loadBooks(storage, seed = []) {
  for (const key of [KEY, LEGACY_KEY]) {
    const { raw, list } = readList(storage, key);
    if (raw === null) continue;
    if (!list) {
      try {
        storage.setItem(`${key}:broken`, raw);
      } catch {
        // best effort only
      }
      if (key === KEY) continue;
      break;
    }

    const books = assignNumbers(list.map(normalizeBook).filter(Boolean), seed);
    if (books.length || list.length === 0) {
      if (key === LEGACY_KEY) saveBooks(storage, books);
      return { books, seeded: false };
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
  assignNumbers(books, seed);
  saveBooks(storage, books);
  return { books, seeded: true };
}

export function addBook(books, value, { id = newId(), addedAt = Date.now(), number = null } = {}) {
  const max = books.reduce((current, book) => Math.max(current, book.number ?? 0), 0);
  const next = parseNumber(number) ?? max + 1;
  return [...books, { id, ...value, number: next, addedAt }];
}

export function updateBook(books, id, value) {
  return books.map((book) =>
    book.id === id
      ? { ...book, ...value, id: book.id, number: book.number, addedAt: book.addedAt }
      : book,
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

  const books = assignNumbers(dedupeBooks(normalized), []);
  if (!books.length) throw new Error("В файле нет книг с названиями");
  return { books, skipped: list.length - books.length };
}
