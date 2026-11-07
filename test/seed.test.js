import test from "node:test";
import assert from "node:assert/strict";

import { SEED } from "../src/seed.js";

function expectedYear(number) {
  if (number < 355) return null;
  if (number === 355) return 2018;
  if (number <= 438) return 2019;
  if (number <= 463) return 2020;
  if (number <= 484) return 2021;
  if (number <= 537) return 2022;
  if (number <= 568) return 2023;
  if (number <= 638) return 2024;
  if (number <= 728) return 2025;
  return 2026;
}

test("seed — это все 765 записей, включая повторные прочтения", () => {
  assert.equal(SEED.length, 765);
  assert.equal(new Set(SEED.map((book) => book.id)).size, 765);
  assert.equal(new Set(SEED.map((book) => book.number)).size, 765);

  for (const [index, book] of SEED.entries()) {
    assert.equal(book.number, index + 1, "номера идут подряд 1..765");
    assert.ok(book.title.trim(), "у книги есть название");
    assert.ok(["audio", "book"].includes(book.format), `формат ${book.format}`);
    assert.equal(book.addedAt, index);
  }
});

test("повторные прочтения сохранены отдельными записями", () => {
  const harry = SEED.filter((book) => book.title === "Гарри Поттер и Философский камень");
  assert.equal(harry.length, 2);
  assert.deepEqual(harry.map((book) => book.number), [354, 457]);

  const deathly = SEED.filter((book) => book.title === "Гарри Поттер и Дары Смерти");
  assert.equal(deathly.length, 2);
  assert.deepEqual(deathly.map((book) => book.year), [2019, 2020]);

  const month = SEED.filter((book) => book.title === "Месяц в деревне");
  assert.equal(month.length, 2);
});

test("годы выведены из границ docx для всех 765 книг", () => {
  for (const book of SEED) {
    assert.equal(book.year, expectedYear(book.number), `книга №${book.number}`);
  }
  assert.equal(SEED.find((book) => book.number === 355).year, 2018);
  assert.equal(SEED.find((book) => book.number === 356).year, 2019);
  assert.equal(SEED.find((book) => book.number === 728).year, 2025);
  assert.equal(SEED.find((book) => book.number === 729).year, 2026);
  assert.equal(SEED.filter((book) => book.year === null).length, 354);
  assert.equal(SEED.filter((book) => book.year !== null).length, 411);
});

test("в seed 528 аудиокниг и 237 обычных книг", () => {
  assert.equal(SEED.filter((book) => book.format === "audio").length, 528);
  assert.equal(SEED.filter((book) => book.format === "book").length, 237);
});
