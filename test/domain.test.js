import test from "node:test";
import assert from "node:assert/strict";

import {
  FORMATS,
  filterBooks,
  formatLabel,
  groupBooks,
  groupLetter,
  normalizeSearch,
  pluralBooks,
  sortBooks,
  validateBookInput,
  dedupeBooks,
} from "../src/domain.js";

const books = [
  { id: "1", title: "Гарри Поттер и философский камень", author: "Джоан Роулинг", format: "audio", year: 2018, addedAt: 1 },
  { id: "2", title: "Шипы чёрного ириса", author: "", format: "paper", year: null, addedAt: 2 },
  { id: "3", title: "Ёлка", author: "Анна Иванова", format: "ebook", year: 2024, addedAt: 3 },
  { id: "4", title: "451 градус по Фаренгейту", author: "Рэй Брэдбери", format: "audio", year: 2021, addedAt: 4 },
  { id: "5", title: "Апельсин", author: "Джоан Роулинг", format: "unknown", year: null, addedAt: 5 },
  { id: "6", title: "Мёртвая зона", author: "", format: "unknown", year: null, addedAt: 6 },
];

test("FORMATS содержит только известные форматы", () => {
  assert.deepEqual(FORMATS, ["audio", "paper", "ebook", "unknown"]);
  assert.equal(formatLabel("audio"), "Аудио");
  assert.equal(formatLabel("paper"), "Бумага");
  assert.equal(formatLabel("ebook"), "Электронная");
  assert.equal(formatLabel("unknown"), "Не указан");
});

test("normalizeSearch приводит регистр, ё и лишние пробелы", () => {
  assert.equal(normalizeSearch("  ЧЁРНЫЙ   Ирис "), "черный ирис");
});

test("поиск идёт по названию и автору без учёта регистра", () => {
  assert.deepEqual(filterBooks(books, { query: "гарри" }).map((b) => b.id), ["1"]);
  assert.deepEqual(filterBooks(books, { query: "роулинг" }).map((b) => b.id), ["1", "5"]);
});

test("поиск понимает ё как е", () => {
  assert.deepEqual(filterBooks(books, { query: "черного" }).map((b) => b.id), ["2"]);
  assert.deepEqual(filterBooks(books, { query: "мертвая" }).map((b) => b.id), ["6"]);
});

test("несколько слов в запросе ищутся одновременно", () => {
  assert.deepEqual(filterBooks(books, { query: "поттер роулинг" }).map((b) => b.id), ["1"]);
  assert.deepEqual(filterBooks(books, { query: "поттер брэдбери" }).map((b) => b.id), []);
});

test("пустой запрос возвращает все книги", () => {
  assert.equal(filterBooks(books, { query: "   " }).length, books.length);
});

test("фильтр по формату работает вместе с поиском", () => {
  assert.deepEqual(filterBooks(books, { query: "", format: "audio" }).map((b) => b.id), ["1", "4"]);
  assert.deepEqual(filterBooks(books, { query: "роулинг", format: "audio" }).map((b) => b.id), ["1"]);
});

test("сортировка по названию использует русский алфавит и числа", () => {
  assert.deepEqual(sortBooks(books, "title").map((b) => b.title), [
    "451 градус по Фаренгейту",
    "Апельсин",
    "Гарри Поттер и философский камень",
    "Ёлка",
    "Мёртвая зона",
    "Шипы чёрного ириса",
  ]);
});

test("сортировка «сначала новые» ставит недавние книги вперёд", () => {
  const extra = { id: "7", title: "Новая", author: "", format: "unknown", year: null, addedAt: 999 };
  assert.deepEqual(sortBooks([...books, extra], "new").map((b) => b.id)[0], "7");
});

test("группировка по первой букве", () => {
  assert.equal(groupLetter("«Сыщики»"), "С");
  assert.equal(groupLetter("451 градус"), "#");
  assert.equal(groupLetter("  harry potter"), "H");
  assert.equal(groupLetter("Ёлка"), "Ё");
  const groups = groupBooks(sortBooks(books, "title"));
  assert.deepEqual(groups.map((g) => g.letter), ["#", "А", "Г", "Ё", "М", "Ш"]);
  assert.equal(groups.reduce((sum, g) => sum + g.books.length, 0), books.length);
});

test("склонение количества книг", () => {
  assert.equal(pluralBooks(1), "книга");
  assert.equal(pluralBooks(2), "книги");
  assert.equal(pluralBooks(5), "книг");
  assert.equal(pluralBooks(11), "книг");
  assert.equal(pluralBooks(21), "книга");
  assert.equal(pluralBooks(101), "книга");
  assert.equal(pluralBooks(111), "книг");
  assert.equal(pluralBooks(765), "книг");
});

test("валидация: название обязательно и обрезается", () => {
  const result = validateBookInput({ title: "  Книга  ", author: "", year: "" }, { books });
  assert.equal(result.ok, true);
  assert.equal(result.value.title, "Книга");
  assert.equal(result.value.author, "");
  assert.equal(result.value.format, "unknown");
  assert.equal(result.value.year, null);

  const empty = validateBookInput({ title: "   " }, { books });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.title, /название/i);
});

test("валидация: год только целый и в разумных границах", () => {
  assert.equal(validateBookInput({ title: "Книга", year: "2024" }, { books }).ok, true);
  assert.equal(validateBookInput({ title: "Книга", year: "2024" }, { books }).value.year, 2024);
  assert.equal(validateBookInput({ title: "Книга", year: "abcd" }, { books }).ok, false);
  assert.equal(validateBookInput({ title: "Книга", year: "1899" }, { books }).ok, false);
  assert.equal(validateBookInput({ title: "Книга", year: "2101" }, { books }).ok, false);
});

test("валидация: дубль по названию и автору не добавляется", () => {
  const result = validateBookInput(
    { title: "гарри поттер и философский камень", author: "джоан роулинг" },
    { books },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.title, /уже есть/i);

  const self = validateBookInput(
    { title: "Гарри Поттер и философский камень", author: "Джоан Роулинг" },
    { books, excludeId: "1" },
  );
  assert.equal(self.ok, true);
});

test("валидация: формат проверяется", () => {
  const result = validateBookInput({ title: "Книга", format: "vinyl" }, { books });
  assert.equal(result.ok, false);
  assert.ok(result.errors.format);
});

test("dedupeBooks убирает повторы без учёта регистра и добирает недостающие данные", () => {
  const input = [
    { id: "a", title: "Гарри Поттер", author: "Джоан Роулинг", format: "unknown", year: null, addedAt: 1 },
    { id: "b", title: "гарри поттер", author: "джоан роулинг", format: "audio", year: 2018, addedAt: 2 },
    { id: "c", title: "Другая", author: "", format: "unknown", year: null, addedAt: 3 },
  ];
  const result = dedupeBooks(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].format, "audio");
  assert.equal(result[0].year, 2018);
});

test("dedupeBooks склеивает длинный дубль без автора, но не короткие названия", () => {
  const input = [
    { id: "a", title: "Гарри Поттер и проклятое дитя", author: "", format: "unknown", year: null, addedAt: 1 },
    {
      id: "b",
      title: "Гарри Поттер и проклятое дитя",
      author: "Джоан Роулинг, Джек Торн",
      format: "audio",
      year: null,
      addedAt: 2,
    },
    { id: "c", title: "Маскарад", author: "", format: "unknown", year: null, addedAt: 3 },
    { id: "d", title: "Маскарад", author: "Александр Дюма", format: "audio", year: null, addedAt: 4 },
  ];
  const result = dedupeBooks(input);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, "b");
  assert.equal(result[0].format, "audio");
  assert.equal(result[0].author, "Джоан Роулинг, Джек Торн");
  assert.deepEqual(result.slice(1).map((book) => book.id), ["c", "d"]);
});
