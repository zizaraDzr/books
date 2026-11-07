import test from "node:test";
import assert from "node:assert/strict";

import {
  FORMATS,
  assignPeriodYears,
  filterBooks,
  formatLabel,
  groupBooks,
  groupBooksByPeriod,
  groupLetter,
  inferYearPeriods,
  normalizeSearch,
  pluralBooks,
  sortBooks,
  validateBookInput,
} from "../src/domain.js";

const books = [
  { id: "1", number: 10, title: "Гарри Поттер и философский камень", author: "Джоан Роулинг", format: "audio", year: 2018, addedAt: 1 },
  { id: "2", number: 20, title: "Шипы чёрного ириса", author: "", format: "book", year: null, addedAt: 2 },
  { id: "3", number: 30, title: "Ёлка", author: "Анна Иванова", format: "book", year: 2024, addedAt: 3 },
  { id: "4", number: 40, title: "451 градус по Фаренгейту", author: "Рэй Брэдбери", format: "audio", year: 2021, addedAt: 4 },
  { id: "5", number: 50, title: "Апельсин", author: "Джоан Роулинг", format: "book", year: null, addedAt: 5 },
  { id: "6", number: 60, title: "Мёртвая зона", author: "", format: "book", year: null, addedAt: 6 },
];

test("FORMATS содержит только аудио и книгу", () => {
  assert.deepEqual(FORMATS, ["audio", "book"]);
  assert.equal(formatLabel("audio"), "Аудио");
  assert.equal(formatLabel("book"), "Книга");
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
  assert.deepEqual(filterBooks(books, { query: "", format: "book" }).map((b) => b.id), ["2", "3", "5", "6"]);
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
  const extra = { id: "7", title: "Новая", author: "", format: "book", year: null, addedAt: 999 };
  assert.deepEqual(sortBooks([...books, extra], "new").map((b) => b.id)[0], "7");
});

test("сортировка «по порядку» идёт по номерам docx", () => {
  assert.deepEqual(sortBooks([...books].reverse(), "order").map((b) => b.number), [10, 20, 30, 40, 50, 60]);
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

test("хронологическая группировка: год в начале и конце блока", () => {
  const rows = [
    { id: "a", number: 1, title: "Альфа", author: "", format: "book", year: null, addedAt: 1 },
    { id: "b", number: 2, title: "Бета", author: "", format: "book", year: 2018, addedAt: 2 },
    { id: "c", number: 3, title: "Гамма", author: "", format: "book", year: 2019, addedAt: 3 },
    { id: "d", number: 4, title: "Дельта", author: "", format: "book", year: 2019, addedAt: 4 },
    { id: "e", number: 5, title: "Эпсилон", author: "", format: "book", year: 2026, addedAt: 5 },
  ];
  const groups = groupBooksByPeriod(rows);
  assert.deepEqual(groups.map((g) => g.label), ["До 2018", "2018", "2019", "2026"]);
  assert.deepEqual(groups.map((g) => g.showEnd), [false, false, true, false]);
  assert.deepEqual(groups[2].books.map((b) => b.number), [3, 4]);
  assert.equal(groups.reduce((sum, g) => sum + g.books.length, 0), rows.length);
});

test("периоды годов вычисляются по парным отметкам до удаления дублей", () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({
    number: index + 1,
    title: `Книга ${index + 1}`,
    author: "",
    format: "book",
    year: null,
  }));
  entries[3].year = 2018;
  entries[4].year = 2019;
  entries[7].year = 2019;
  entries[8].year = 2020;

  const periods = inferYearPeriods(entries);
  assert.deepEqual(
    periods.map((period) => [period.year, period.start, period.end]),
    [
      [2018, 3, 3],
      [2019, 4, 7],
      [2020, 8, 9],
    ],
  );
  assert.deepEqual(assignPeriodYears(entries, periods).map((entry) => entry.year), [
    null,
    null,
    null,
    2018,
    2019,
    2019,
    2019,
    2019,
    2020,
    2020,
  ]);
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
  assert.equal(result.value.format, "book");
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

test("валидация: повторное прочтение не считается дублем", () => {
  const result = validateBookInput({
    title: "Гарри Поттер и философский камень",
    author: "Джоан Роулинг",
  });
  assert.equal(result.ok, true);
});

test("валидация: формат проверяется", () => {
  const result = validateBookInput({ title: "Книга", format: "vinyl" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.format);
});
