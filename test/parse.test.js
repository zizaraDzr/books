import test from "node:test";
import assert from "node:assert/strict";

import { parseEntry, dedupeEntries } from "../src/parse.js";

test("обычная запись с автором и аудио-пометкой", () => {
  assert.deepEqual(parseEntry("Гарри Поттер и Тайная комната - Джоан Роулинг (аудио книга) 2018 ГОД"), {
    title: "Гарри Поттер и Тайная комната",
    author: "Джоан Роулинг",
    format: "audio",
    year: 2018,
  });
});

test("название без автора сохраняется целиком", () => {
  assert.deepEqual(parseEntry("Рандеву в лифте"), {
    title: "Рандеву в лифте",
    author: "",
    format: "unknown",
    year: null,
  });
});

test("дефис внутри слова не считается разделителем", () => {
  const entry = parseEntry("Всем парням, которых я когда-либо любила");
  assert.equal(entry.title, "Всем парням, которых я когда-либо любила");
  assert.equal(entry.author, "");
  assert.equal(parseEntry("Гоголь-моголь (аудио книга)").title, "Гоголь-моголь");
});

test("дефис без пробела перед автором всё равно разделяет", () => {
  assert.deepEqual(parseEntry("13 способов ненавидеть -Татьяна Гармаш-Роффе (аудио книга)"), {
    title: "13 способов ненавидеть",
    author: "Татьяна Гармаш-Роффе",
    format: "audio",
    year: null,
  });
  assert.equal(parseEntry("451 градус по Фаренгейту- Рэй Брэдбери (аудио книга)").author, "Рэй Брэдбери");
});

test("последний разделитель выигрывает, тире в названии сохраняется", () => {
  const entry = parseEntry("Виктор Цой — охотник на вампиров - Евгений Шиков, Андрей Рахметов (аудио книга)");
  assert.equal(entry.title, "Виктор Цой — охотник на вампиров");
  assert.equal(entry.author, "Евгений Шиков, Андрей Рахметов");
});

test("несколько авторов сохраняются как одна строка", () => {
  const entry = parseEntry("Женитьба Белугина - Александр Островский, Николай Соловьев (аудио книга)");
  assert.equal(entry.author, "Александр Островский, Николай Соловьев");
});

test("«книга с работы» — бумажный формат, пометка убирается", () => {
  assert.deepEqual(parseEntry("Лето - Алла Горбунова (книга с работы)"), {
    title: "Лето",
    author: "Алла Горбунова",
    format: "paper",
    year: null,
  });
});

test("год из названия не путается с годом прочтения", () => {
  const entry = parseEntry("Хьюстон, 2030");
  assert.equal(entry.title, "Хьюстон, 2030");
  assert.equal(entry.year, null);
});

test("BOM, неразрывные пробелы и табы нормализуются", () => {
  assert.equal(parseEntry("\ufeff\ufeff  Р. S. Я все ещё люблю тебя  ").title, "Р. S. Я все ещё люблю тебя");
  assert.equal(
    parseEntry('Новелла по мотивам серии "Тираны". Храм на костях\t (Этногенез)').title,
    'Новелла по мотивам серии "Тираны". Храм на костях (Этногенез)',
  );
});

test("серия в скобках остаётся частью названия", () => {
  assert.equal(parseEntry("Пираты 1. (Этногенез)").title, "Пираты 1. (Этногенез)");
});

test("пустые строки и заголовок списка отбрасываются", () => {
  assert.equal(parseEntry(""), null);
  assert.equal(parseEntry("   "), null);
  assert.equal(parseEntry("Прочитанные книги:"), null);
});

test("dedupeEntries убирает повторы по названию и автору", () => {
  const entries = [
    { title: "Гарри Поттер и Философский камень", author: "Джоан Роулинг", format: "audio", year: null },
    { title: "Гарри Поттер и философский камень", author: "джоан роулинг", format: "audio", year: 2018 },
    { title: "Другая", author: "", format: "unknown", year: null },
  ];
  const result = dedupeEntries(entries);
  assert.equal(result.length, 2);
  assert.equal(result[0].year, 2018);
});
