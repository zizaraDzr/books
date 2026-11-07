import test from "node:test";
import assert from "node:assert/strict";

import { FORMATS, bookKey } from "../src/domain.js";
import { SEED } from "../src/seed.js";

test("seed — это 755 уникальных книг с корректными полями", () => {
  assert.equal(SEED.length, 755);
  assert.equal(new Set(SEED.map((book) => book.id)).size, SEED.length);
  assert.equal(new Set(SEED.map(bookKey)).size, SEED.length);

  for (const book of SEED) {
    assert.ok(book.title.trim(), "у книги есть название");
    assert.ok(FORMATS.includes(book.format), `формат ${book.format}`);
    assert.ok(book.year === null || (book.year >= 1900 && book.year <= 2100));
    assert.ok(Number.isFinite(book.addedAt));
  }
});

test("в seed нет повторяющихся длинных названий без автора", () => {
  const byTitle = new Map();
  for (const book of SEED) {
    const title = book.title.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    byTitle.set(title, (byTitle.get(title) ?? 0) + 1);
  }
  for (const [title, count] of byTitle) {
    if (count < 2 || title.split(" ").length < 3) continue;
    const books = SEED.filter((book) => book.title.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim() === title);
    assert.equal(books.filter((book) => book.author).length, 1, title);
    assert.equal(books.filter((book) => !book.author).length, 0, title);
  }
});
