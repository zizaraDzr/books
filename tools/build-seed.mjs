import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dedupeEntries, parseEntry } from "../src/parse.js";
import { formatLabel } from "../src/domain.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.join(root, "tools", "raw-lines.json");
const seedPath = path.join(root, "src", "seed.js");

const raw = JSON.parse(await readFile(rawPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("raw-lines.json должен содержать массив строк");

const entries = raw.map(parseEntry).filter(Boolean);
const unique = dedupeEntries(entries);

const books = unique.map((entry, index) => ({
  id: `seed-${String(index + 1).padStart(3, "0")}`,
  ...entry,
  addedAt: index,
}));

const header = [
  "// Сгенерировано tools/build-seed.mjs из списка «Прочитанные книги». Не редактировать вручную.",
  `// Записей в источнике: ${raw.length}, распознано: ${entries.length}, после удаления дублей: ${books.length}.`,
  "",
  "export const SEED = [",
];
const body = books.map((book) => `  ${JSON.stringify(book)},`);
const footer = ["];", ""];

await writeFile(seedPath, [...header, ...body, ...footer].join("\n"), "utf8");

const formats = new Map();
for (const book of books) formats.set(book.format, (formats.get(book.format) ?? 0) + 1);

const noAuthor = books.filter((book) => !book.author).length;
const withYear = books.filter((book) => book.year).length;
const suspicious = books.filter((book) => !book.author && /\s[-–—]\s/.test(book.title));

console.log(`Источник: ${raw.length}`);
console.log(`Распознано: ${entries.length}`);
console.log(`Дублей удалено: ${entries.length - books.length}`);
console.log(`Итого книг: ${books.length}`);
console.log(`Без автора: ${noAuthor}`);
console.log(`С годом: ${withYear}`);
for (const [format, count] of formats) console.log(`  ${formatLabel(format)}: ${count}`);
console.log(`Подозрительные названия без автора: ${suspicious.length}`);
for (const book of suspicious.slice(0, 10)) console.log(`  ${JSON.stringify(book.title)}`);
console.log("Примеры:");
for (const book of books.slice(0, 5)) console.log(" ", JSON.stringify(book));
