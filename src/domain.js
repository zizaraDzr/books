export const FORMATS = ["audio", "book"];

const FORMAT_LABELS = {
  audio: "Аудио",
  book: "Книга",
};

const collator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

export function formatLabel(format) {
  return FORMAT_LABELS[format] ?? FORMAT_LABELS.book;
}

export function normalizeSearch(value) {
  let text = String(value ?? "").toLowerCase().replace(/ё/g, "е");
  // NFD полезен для латинских диакритик, но превращает «й» в «и» + breve.
  if (/[\u00c0-\u024f]/.test(text)) {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeSpaces(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bookHaystack(book) {
  return normalizeSearch(`${book.title} ${book.author}`);
}

export function filterBooks(books, { query = "", format = "all" } = {}) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  return books.filter((book) => {
    if (format !== "all" && book.format !== format) return false;
    if (!tokens.length) return true;
    const haystack = bookHaystack(book);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function sortBooks(books, mode = "title") {
  const copy = [...books];
  if (mode === "new") {
    return copy.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || collator.compare(a.title, b.title));
  }
  return copy.sort(
    (a, b) =>
      collator.compare(a.title, b.title) ||
      collator.compare(a.author ?? "", b.author ?? "") ||
      String(a.id).localeCompare(String(b.id)),
  );
}

export function groupLetter(title) {
  const text = String(title ?? "").trim().replace(/^[«»"'“”„([\s]+/, "");
  const first = Array.from(text)[0] ?? "#";
  if (/[A-Za-zА-Яа-яЁё]/.test(first)) return first.toUpperCase();
  return "#";
}

export function groupBooks(sortedBooks) {
  const groups = [];
  const byLetter = new Map();
  for (const book of sortedBooks) {
    const letter = groupLetter(book.title);
    let group = byLetter.get(letter);
    if (!group) {
      group = { letter, books: [] };
      byLetter.set(letter, group);
      groups.push(group);
    }
    group.books.push(book);
  }
  return groups;
}

export function groupBooksByYear(books) {
  const byYear = new Map();
  for (const book of books) {
    const year = book.year ?? null;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(book);
  }

  const years = [...byYear.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });

  return years.map((year) => {
    const group = byYear.get(year);
    const books =
      year === null
        ? sortBooks(group, "title")
        : [...group].sort(
            (a, b) =>
              (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) ||
              collator.compare(a.title, b.title),
          );
    return { year, label: year === null ? "Без года" : String(year), books };
  });
}

export function pluralBooks(count) {
  const abs = Math.abs(Number(count) || 0);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "книг";
  if (last === 1) return "книга";
  if (last >= 2 && last <= 4) return "книги";
  return "книг";
}

export function bookKey(book) {
  return `${normalizeSearch(book.title)}|${normalizeSearch(book.author)}`;
}

function mergeMissing(target, source) {
  if (!target.year && source.year) target.year = source.year;
  if (target.format !== "audio" && source.format === "audio") target.format = "audio";
  if (!target.author && source.author) target.author = source.author;
}

export function dedupeBooks(books) {
  const exact = new Map();
  for (const book of books) {
    const key = bookKey(book);
    const existing = exact.get(key);
    if (!existing) {
      exact.set(key, { ...book });
      continue;
    }
    mergeMissing(existing, book);
  }

  const values = [...exact.values()];
  const byTitle = new Map();
  for (const book of values) {
    const title = normalizeSearch(book.title);
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(book);
  }

  const removed = new Set();
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;
    const wordCount = title.split(" ").filter(Boolean).length;
    const authored = group.filter((book) => book.author);
    const anonymous = group.filter((book) => !book.author);
    // Короткие названия вроде «Маскарад» могут быть разными произведениями,
    // поэтому склеиваем только достаточно длинные названия с одним автором.
    if (wordCount < 3 || authored.length !== 1 || anonymous.length !== 1) continue;
    mergeMissing(authored[0], anonymous[0]);
    removed.add(anonymous[0]);
  }

  return values.filter((book) => !removed.has(book));
}

export function validateBookInput(input = {}, { books = [], excludeId = null } = {}) {
  const errors = {};
  const title = normalizeSpaces(input.title);
  const author = normalizeSpaces(input.author);
  const rawFormat = input.format || "book";
  const format = FORMATS.includes(rawFormat) ? rawFormat : "book";
  const rawYear = input.year;
  let year = null;

  if (!title) {
    errors.title = "Введите название книги";
  } else if (title.length > 300) {
    errors.title = "Название длиннее 300 символов";
  }

  if (rawFormat && !FORMATS.includes(rawFormat)) {
    errors.format = "Выберите формат из списка";
  }

  if (rawYear !== "" && rawYear !== null && rawYear !== undefined) {
    const asString = String(rawYear).trim();
    if (!/^\d{4}$/.test(asString)) {
      errors.year = "Год должен состоять из четырёх цифр";
    } else {
      const parsed = Number(asString);
      if (parsed < 1900 || parsed > 2100) {
        errors.year = "Укажите год от 1900 до 2100";
      } else {
        year = parsed;
      }
    }
  }

  if (!errors.title) {
    const key = `${normalizeSearch(title)}|${normalizeSearch(author)}`;
    const duplicate = books.some((book) => book.id !== excludeId && bookKey(book) === key);
    if (duplicate) errors.title = "Такая книга уже есть в списке";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { title, author, format, year },
  };
}
