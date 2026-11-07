import test from "node:test";
import assert from "node:assert/strict";

import {
  KEY,
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
  { id: "seed-1", title: "Первая", author: "Автор", format: "audio", year: 2020 },
  { id: "seed-2", title: "Вторая", author: "", format: "unknown", year: null },
];

const sample = { title: "Новая книга", author: "Иван Петров", format: "paper", year: 2025 };

test("первый запуск заполняет хранилище seed-списком", () => {
  const storage = memoryStorage();
  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, true);
  assert.equal(result.books.length, 2);
  assert.equal(result.books[0].id, "seed-1");
  assert.ok(storage.getItem(KEY));
});

test("повторный запуск читает сохранённый список, а не seed", () => {
  const storage = memoryStorage();
  loadBooks(storage, seed);
  saveBooks(storage, [{ id: "x", title: "Только одна", author: "", format: "unknown", year: null, addedAt: 1 }]);
  const result = loadBooks(storage, seed);
  assert.equal(result.seeded, false);
  assert.deepEqual(result.books.map((b) => b.title), ["Только одна"]);
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

test("addBook добавляет книгу в конец", () => {
  const books = [{ id: "a", title: "Старая", author: "", format: "unknown", year: null, addedAt: 1 }];
  const result = addBook(books, sample, { id: "b", addedAt: 2 });
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], { id: "b", ...sample, addedAt: 2 });
  assert.equal(books.length, 1, "исходный массив не мутируется");
});

test("updateBook меняет только выбранную книгу", () => {
  const books = [
    { id: "a", title: "Старая", author: "", format: "unknown", year: null, addedAt: 1 },
    { id: "b", title: "Другая", author: "", format: "unknown", year: null, addedAt: 2 },
  ];
  const result = updateBook(books, "a", { ...sample, title: "Обновлённая" });
  assert.equal(result[0].title, "Обновлённая");
  assert.equal(result[0].id, "a");
  assert.equal(result[0].addedAt, 1);
  assert.equal(result[1].title, "Другая");
});

test("removeBook возвращает удалённую книгу и её позицию", () => {
  const books = [
    { id: "a", title: "A", author: "", format: "unknown", year: null, addedAt: 1 },
    { id: "b", title: "B", author: "", format: "unknown", year: null, addedAt: 2 },
  ];
  const { books: rest, removed, index } = removeBook(books, "a");
  assert.equal(rest.length, 1);
  assert.equal(removed.id, "a");
  assert.equal(index, 0);
});

test("restoreBook возвращает книгу на прежнее место и идемпотентен", () => {
  const books = [
    { id: "b", title: "B", author: "", format: "unknown", year: null, addedAt: 2 },
  ];
  const removed = { id: "a", title: "A", author: "", format: "unknown", year: null, addedAt: 1 };
  const once = restoreBook(books, removed, 0);
  const twice = restoreBook(once, removed, 0);
  assert.deepEqual(once.map((b) => b.id), ["a", "b"]);
  assert.deepEqual(twice.map((b) => b.id), ["a", "b"]);
});

test("normalizeBook отбрасывает мусор и чинит допустимые поля", () => {
  assert.equal(normalizeBook(null), null);
  assert.equal(normalizeBook({ title: "" }), null);
  assert.equal(normalizeBook({ title: "  Книга  " }).title, "Книга");
  assert.equal(normalizeBook({ title: "Книга", format: "vinyl" }).format, "unknown");
  assert.equal(normalizeBook({ title: "Книга", year: "2024" }).year, 2024);
  assert.equal(normalizeBook({ title: "Книга", year: 1800 }).year, null);
  assert.equal(normalizeBook({ title: "Книга", author: 42 }).author, "");
});

test("экспорт и импорт сохраняют список", () => {
  const books = [{ id: "a", title: "Книга", author: "Автор", format: "audio", year: 2024, addedAt: 10 }];
  const payload = toExport(books);
  assert.equal(payload.version, 1);
  assert.equal(payload.books.length, 1);
  const imported = fromExport(payload).books;
  assert.deepEqual(imported, books);
});

test("импорт принимает голый массив и отклоняет мусор", () => {
  assert.equal(fromExport([{ title: "Книга" }]).books.length, 1);
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
