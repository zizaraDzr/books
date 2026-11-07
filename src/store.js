import { bookKey, normalizeSpaces } from "./domain.js";

export const KEY = "books:v4";
export const LEGACY_KEYS = ["books:v3", "books:v2", "books:v1"];
const VERSION = 4;

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

function restoreFromSeed(stored, seed, { preserveYears = false } = {}) {
  const base = seed.map((book) => normalizeBook(book)).filter(Boolean);
  const byNumber = new Map(base.map((book) => [book.number, book]));
  const byKey = new Map();
  for (const book of base) {
    const key = bookKey(book);
    if (!byKey.has(key)) byKey.set(key, book);
  }

  const matched = new Set();
  const extras = [];

  for (const book of stored) {
    let target = book.number ? byNumber.get(book.number) : null;
    if (!target && !book.number) target = byKey.get(bookKey(book)) ?? null;

    if (target && !matched.has(target.number)) {
      target.title = book.title;
      target.author = book.author;
      target.format = book.format;
      if (preserveYears) target.year = book.year;
      matched.add(target.number);
    } else {
      extras.push(book);
    }
  }

  const used = new Set(base.map((book) => book.number));
  let next = Math.max(0, ...used) + 1;

  for (const extra of extras) {
    let number = extra.number;
    if (!number || used.has(number)) {
      while (used.has(next)) next += 1;
      number = next;
      used.add(number);
      next += 1;
    } else {
      used.add(number);
    }
    base.push({ ...extra, number });
  }

  return base;
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
  for (const key of [KEY, ...LEGACY_KEYS]) {
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

    if (list.length === 0) {
      if (key !== KEY) saveBooks(storage, []);
      return { books: [], seeded: false };
    }

    const stored = list.map(normalizeBook).filter(Boolean);
    if (key === KEY) {
      return { books: assignNumbers(stored, seed), seeded: false };
    }

    const books = restoreFromSeed(stored, seed, { preserveYears: key === "books:v3" });
    saveBooks(storage, books);
    return { books, seeded: false };
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

export function fromExport(data, seed = []) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.books) ? data.books : null;
  if (!list) throw new Error("Некорректный файл: не найден список книг");
  if (!list.length) throw new Error("В файле нет книг");

  const version = Number(data?.version ?? 1);
  const appExport = !Array.isArray(data) && data?.app === "prochitano";
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

  const books =
    appExport && version < VERSION && seed.length
      ? restoreFromSeed(normalized, seed, { preserveYears: version >= 3 })
      : assignNumbers(normalized, seed);

  if (!books.length) throw new Error("В файле нет книг с названиями");
  return { books, skipped: Math.max(0, list.length - books.length) };
}
