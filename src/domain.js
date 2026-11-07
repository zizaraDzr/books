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
  if (mode === "order") {
    return copy.sort(
      (a, b) =>
        (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) ||
        (a.addedAt ?? 0) - (b.addedAt ?? 0),
    );
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

export function groupBooksByPeriod(books) {
  const sorted = sortBooks(books, "order");
  const groups = [];

  for (const book of sorted) {
    const last = groups.at(-1);
    if (!last || last.year !== book.year) {
      groups.push({ year: book.year ?? null, books: [book] });
    } else {
      last.books.push(book);
    }
  }

  return groups.map((group, index) => ({
    ...group,
    label: group.year === null ? (index === 0 ? "До 2018" : "Без года") : String(group.year),
    showEnd: group.year !== null && group.books.length > 1 && index < groups.length - 1,
  }));
}

export function inferYearPeriods(entries) {
  const markers = entries
    .map((entry, index) => (entry.year ? { year: entry.year, index } : null))
    .filter(Boolean);
  if (!markers.length) return [];

  const byYear = new Map();
  for (const marker of markers) {
    if (!byYear.has(marker.year)) byYear.set(marker.year, []);
    byYear.get(marker.year).push(marker);
  }

  const periods = [];
  for (const [year, list] of byYear) {
    if (list.length >= 2) {
      periods.push({ year, start: list[0].index, end: list.at(-1).index, boundaries: 2 });
      continue;
    }

    const single = list[0];
    const hasLater = markers.some((marker) => marker.year > year);
    periods.push({
      year,
      start: single.index,
      end: hasLater ? single.index : entries.length - 1,
      boundaries: 1,
    });
  }

  return periods.sort((a, b) => a.start - b.start);
}

export function assignPeriodYears(entries, periods) {
  const assigned = entries.map((entry) => ({ ...entry, year: null }));
  for (const period of periods) {
    for (let index = period.start; index <= period.end; index += 1) {
      assigned[index].year = period.year;
    }
  }
  return assigned;
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

export function validateBookInput(input = {}) {
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

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { title, author, format, year },
  };
}
