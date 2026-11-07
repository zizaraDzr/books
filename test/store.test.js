import test from "node:test";
import assert from "node:assert/strict";

import {
  KEY,
  LEGACY_KEYS,
  addBook,
  fromExport,
  loadBooks,
  newId,
  normalizeBook,
  removeBook,
  restoreBook,
  saveBooks,
  toExport,
  updateBook,
} from "../src/store.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

const seed = [
  { id: "seed-1", number: 1, title: "Первая", author: "Автор", format: "book", year: 2018 },
  { id: "seed-2", number: 2, title: "Вторая", author: "", format: "book", year: 2019 },
  { id: "seed-3", number: 3, title: "Вторая", author: "", format: "book", year: 2019 },
];

const sample = { title: "Новая книга", author: "Иван Петров", format: "book", year: 2025 };

test("первый запуск заполняет хранилище seed-списком с повторами", () => {
  const storage = memoryStorage();
  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, true);
  assert.equal(result.books.length, 3);
  assert.equal(result.books[0].id, "seed-1");
  assert.equal(result.books[0].number, 1);
  assert.equal(result.books[2].title, "Вторая");
  assert.ok(storage.getItem(KEY));
  assert.deepEqual(LEGACY_KEYS, ["books:v3", "books:v2", "books:v1"]);
});

test("повторный запуск читает сохранённый список, а не seed", () => {
  const storage = memoryStorage();
  loadBooks(storage, seed);
  saveBooks(storage, [
    { id: "x", number: 7, title: "Только одна", author: "", format: "book", year: 2024, addedAt: 1 },
  ]);
  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, false);
  assert.deepEqual(result.books.map((b) => b.title), ["Только одна"]);
  assert.equal(result.books[0].number, 7);
  assert.equal(result.books[0].year, 2024);
});

test("пустой сохранённый список не затирается seed-ом", () => {
  const storage = memoryStorage();
  loadBooks(storage, seed);
  saveBooks(storage, []);
  const result = loadBooks(storage, seed);
  assert.equal(result.books.length, 0);
  assert.equal(result.seeded, false);
});

test("битое хранилище не теряется: сохраняется копия и поднимается seed", () => {
  const storage = memoryStorage();
  storage.setItem(KEY, "{not json");
  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, true);
  assert.match(storage.getItem(`${KEY}:broken`), /not json/);
});

test("v3 мигрирует в v4 и возвращает пропущенные повторные прочтения", () => {
  const storage = memoryStorage();
  storage.setItem(
    LEGACY_KEYS[0],
    JSON.stringify({
      version: 3,
      books: [
        { id: "old-1", number: 1, title: "Первая", author: "Автор", format: "book", year: 2021, addedAt: 0 },
        { id: "old-2", number: 2, title: "Вторая", author: "", format: "book", year: 2019, addedAt: 1 },
        { id: "added", number: 7, title: "Добавленная", author: "", format: "audio", year: 2024, addedAt: 2 },
      ],
    }),
  );

  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, false);
  assert.deepEqual(result.books.map((b) => b.number), [1, 2, 3, 7]);
  assert.deepEqual(result.books.map((b) => b.year), [2021, 2019, 2019, 2024]);
  assert.equal(result.books[2].id, "seed-3", "пропущенное повторное прочтение вернулось");
  assert.deepEqual(result.books.map((b) => b.format), ["book", "book", "book", "audio"]);
  assert.ok(storage.getItem(KEY));
  assert.ok(storage.getItem(LEGACY_KEYS[0]));
});

test("v2 мигрирует: годы берутся из seed, повторы возвращаются", () => {
  const storage = memoryStorage();
  storage.setItem(
    LEGACY_KEYS[1],
    JSON.stringify({
      version: 2,
      books: [
        { id: "old-1", number: 1, title: "Первая", author: "Автор", format: "paper", year: 2020, addedAt: 0 },
        { id: "old-2", number: 2, title: "Вторая", author: "", format: "unknown", year: null, addedAt: 1 },
        { id: "added", number: 7, title: "Добавленная", author: "", format: "audio", year: 2024, addedAt: 2 },
      ],
    }),
  );

  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, false);
  assert.deepEqual(result.books.map((b) => b.number), [1, 2, 3, 7]);
  assert.deepEqual(result.books.map((b) => b.year), [2018, 2019, 2019, 2024]);
  assert.deepEqual(result.books.map((b) => b.format), ["book", "book", "book", "audio"]);
  assert.ok(storage.getItem(KEY));
});

test("v1 мигрирует: книги находятся по названию и автору, повторы возвращаются", () => {
  const storage = memoryStorage();
  storage.setItem(
    LEGACY_KEYS[2],
    JSON.stringify({
      version: 1,
      books: [
        { title: "Первая", author: "Автор", format: "paper", year: null, addedAt: 0 },
        { title: "Вторая", author: "", format: "unknown", year: null, addedAt: 1 },
        { title: "Добавленная", author: "", format: "ebook", year: 2024, addedAt: 2 },
      ],
    }),
  );

  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, false);
  assert.deepEqual(result.books.map((b) => b.number), [1, 2, 3, 4]);
  assert.deepEqual(result.books.map((b) => b.year), [2018, 2019, 2019, 2024]);
  assert.deepEqual(result.books.map((b) => b.format), ["book", "book", "book", "book"]);
  assert.ok(storage.getItem(KEY));
});

test("addBook добавляет книгу с номером после максимального", () => {
  const books = [
    { id: "a", number: 2, title: "Старая", author: "", format: "book", year: null, addedAt: 1 },
    { id: "b", number: 5, title: "Средняя", author: "", format: "book", year: null, addedAt: 2 },
  ];
  const result = addBook(books, sample, { id: "c", addedAt: 3 });
  assert.equal(result.length, 3);
  assert.deepEqual(result[2], { id: "c", ...sample, number: 6, addedAt: 3 });
  assert.equal(books.length, 2, "исходный массив не мутируется");
});

test("addBook уважает явный номер", () => {
  const result = addBook([], sample, { id: "c", addedAt: 3, number: 42 });
  assert.equal(result[0].number, 42);
});

test("updateBook меняет книгу, сохраняя номер", () => {
  const books = [
    { id: "a", number: 10, title: "Старая", author: "", format: "book", year: null, addedAt: 1 },
    { id: "b", number: 11, title: "Другая", author: "", format: "book", year: null, addedAt: 2 },
  ];
  const result = updateBook(books, "a", { ...sample, title: "Обновлённая" });
  assert.equal(result[0].title, "Обновлённая");
  assert.equal(result[0].number, 10);
  assert.equal(result[0].id, "a");
  assert.equal(result[1].title, "Другая");
});

test("removeBook возвращает удалённую книгу и её позицию", () => {
  const books = [
    { id: "a", number: 1, title: "A", author: "", format: "book", year: null, addedAt: 1 },
    { id: "b", number: 2, title: "B", author: "", format: "book", year: null, addedAt: 2 },
  ];
  const { books: rest, removed, index } = removeBook(books, "a");
  assert.equal(rest.length, 1);
  assert.equal(removed.id, "a");
  assert.equal(removed.number, 1);
  assert.equal(index, 0);
});

test("restoreBook возвращает книгу на прежнее место и идемпотентен", () => {
  const books = [{ id: "b", number: 2, title: "B", author: "", format: "book", year: null, addedAt: 2 }];
  const removed = { id: "a", number: 1, title: "A", author: "", format: "book", year: null, addedAt: 1 };
  const once = restoreBook(books, removed, 0);
  const twice = restoreBook(once, removed, 0);
  assert.deepEqual(once.map((b) => b.id), ["a", "b"]);
  assert.deepEqual(twice.map((b) => b.id), ["a", "b"]);
});

test("normalizeBook отбрасывает мусор и чинит допустимые поля", () => {
  assert.equal(normalizeBook(null), null);
  assert.equal(normalizeBook({ title: "" }), null);
  assert.equal(normalizeBook({ title: "  Книга  " }).title, "Книга");
  assert.equal(normalizeBook({ title: "Книга", format: "paper" }).format, "book");
  assert.equal(normalizeBook({ title: "Книга", format: "audio" }).format, "audio");
  assert.equal(normalizeBook({ title: "Книга", year: "2024" }).year, 2024);
  assert.equal(normalizeBook({ title: "Книга", year: 1800 }).year, null);
  assert.equal(normalizeBook({ title: "Книга", author: 42 }).author, "");
  assert.equal(normalizeBook({ title: "Книга", number: 0 }).number, null);
  assert.equal(normalizeBook({ title: "Книга", number: 12 }).number, 12);
});

test("normalizeBook не теряет номера и сам не придумывает их", () => {
  assert.equal(normalizeBook({ title: "Книга" }).number, null);
});

test("экспорт и импорт v4 сохраняют повторы, номера и годы", () => {
  const books = [
    { id: "a", number: 1, title: "Одна", author: "Автор", format: "audio", year: 2024, addedAt: 10 },
    { id: "b", number: 2, title: "Одна", author: "Автор", format: "book", year: 2025, addedAt: 11 },
  ];
  const payload = toExport(books);
  assert.equal(payload.version, 4);
  const imported = fromExport(payload, seed).books;
  assert.deepEqual(imported, books);
});

test("импорт v3 возвращает пропущенные повторы и сохраняет годы", () => {
  const result = fromExport(
    {
      app: "prochitano",
      version: 3,
      books: [
        { id: "x", number: 1, title: "Первая", author: "Автор", format: "book", year: 2021 },
        { id: "y", number: 7, title: "Добавленная", author: "", format: "book", year: 2024 },
      ],
    },
    seed,
  ).books;
  assert.deepEqual(result.map((b) => b.number), [1, 2, 3, 7]);
  assert.deepEqual(result.map((b) => b.year), [2021, 2019, 2019, 2024]);
});

test("импорт v2 подставляет годы из seed", () => {
  const result = fromExport(
    {
      app: "prochitano",
      version: 2,
      books: [{ id: "seed-2", number: 2, title: "Вторая", author: "", format: "paper", year: 2020 }],
    },
    seed,
  ).books;
  assert.equal(result.find((b) => b.number === 2).format, "book");
  assert.equal(result.find((b) => b.number === 2).year, 2019);
  assert.equal(result.length, 3, "пропущенный повтор вернулся");
});

test("импорт старого массива без номеров назначает номера и упрощает формат", () => {
  const result = fromExport([
    { title: "Чужая 1", format: "paper" },
    { title: "Чужая 2", format: "ebook" },
  ]).books;
  assert.deepEqual(result.map((b) => b.number), [1, 2]);
  assert.deepEqual(result.map((b) => b.format), ["book", "book"]);
});

test("импорт отклоняет мусор и пустой список", () => {
  assert.throws(() => fromExport({ hello: "world" }), /файл/i);
  assert.throws(() => fromExport([]), /файл/i);
});

test("импорт не принимает книги без названия", () => {
  const result = fromExport({ books: [{ title: "" }, { title: "Норм" }] });
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].title, "Норм");
});

test("newId выдаёт разные идентификаторы", () => {
  assert.notEqual(newId(), newId());
});
