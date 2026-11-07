import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dedupeEntries, parseEntry } from "../src/parse.js";
import { formatLabel } from "../src/domain.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.join(root, "tools", "raw-lines.json");
const seedPath = path.join(root, "src", "seed.js");

const raw = JSON.parse(await readFile(rawPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("raw-lines.json должен содержать массив");

const entries = raw
  .map((item, index) => {
    const text = typeof item === "string" ? item : item?.text;
    const number = typeof item === "object" && Number.isInteger(item?.number) ? item.number : null;
    const parsed = parseEntry(text);
    return parsed ? { ...parsed, number: number ?? index + 1 } : null;
  })
  .filter(Boolean);

const unique = dedupeEntries(entries).map((entry, index) => ({
  ...entry,
  number: entry.number ?? index + 1,
}));

const books = unique.map((entry, index) => ({
  id: `seed-${String(index + 1).padStart(3, "0")}`,
  ...entry,
  addedAt: index,
}));

const header = [
  "// Сгенерировано tools/build-seed.mjs из списка «Прочитанные книги». Не редактировать вручную.",
  `// Записей в источнике: ${entries.length}, после удаления дублей: ${books.length}.`,
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
const maxNumber = Math.max(...books.map((book) => book.number));
const missingNumbers = maxNumber - books.length;
const suspicious = books.filter((book) => !book.author && /\s[-–—]\s/.test(book.title));

console.log(`Источник: ${raw.length}`);
console.log(`Распознано: ${entries.length}`);
console.log(`Дублей удалено: ${entries.length - books.length}`);
console.log(`Итого книг: ${books.length}, номера 1..${maxNumber}, пропущено номеров: ${missingNumbers}`);
console.log(`Без автора: ${noAuthor}`);
console.log(`С годом: ${withYear}`);
for (const [format, count] of formats) console.log(`  ${formatLabel(format)}: ${count}`);
console.log(`Подозрительные названия без автора: ${suspicious.length}`);
for (const book of suspicious.slice(0, 10)) console.log(`  ${JSON.stringify(book.title)}`);
console.log("Примеры:");
for (const book of books.slice(0, 3)) console.log(" ", JSON.stringify(book));
for (const book of books.slice(-2)) console.log(" ", JSON.stringify(book));
