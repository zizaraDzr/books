import test from "node:test";
import assert from "node:assert/strict";

import { bookKey } from "../src/domain.js";
import { SEED } from "../src/seed.js";

test("seed — это 755 уникальных книг с номерами из docx", () => {
  assert.equal(SEED.length, 755);
  assert.equal(new Set(SEED.map((book) => book.id)).size, SEED.length);
  assert.equal(new Set(SEED.map((book) => book.number)).size, SEED.length);
  assert.equal(new Set(SEED.map(bookKey)).size, SEED.length);

  assert.equal(SEED[0].number, 1);
  assert.equal(SEED.at(-1).number, 765);
  assert.equal(765 - SEED.length, 10, "десять номеров удалены вместе с дублями");

  for (const [index, book] of SEED.entries()) {
    assert.ok(book.title.trim(), "у книги есть название");
    assert.ok(["audio", "book"].includes(book.format), `формат ${book.format}`);
    assert.ok(Number.isInteger(book.number) && book.number > 0);
    if (index > 0) assert.ok(book.number > SEED[index - 1].number, "номера идут по возрастанию");
    assert.ok(book.year === null || (book.year >= 1900 && book.year <= 2100));
    assert.equal(book.addedAt, index);
  }
});

test("в seed 520 аудиокниг и 235 обычных книг", () => {
  assert.equal(SEED.filter((book) => book.format === "audio").length, 520);
  assert.equal(SEED.filter((book) => book.format === "book").length, 235);
});

test("в seed нет повторяющихся длинных названий без автора", () => {
  const byTitle = new Map();
  for (const book of SEED) {
    const title = book.title.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    byTitle.set(title, (byTitle.get(title) ?? 0) + 1);
  }
  for (const [title, count] of byTitle) {
    if (count < 2 || title.split(" ").length < 3) continue;
    const books = SEED.filter(
      (book) => book.title.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim() === title,
    );
    assert.equal(books.filter((book) => book.author).length, 1, title);
    assert.equal(books.filter((book) => !book.author).length, 0, title);
  }
});
