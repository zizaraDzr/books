import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseEntry } from "../src/parse.js";
import { assignPeriodYears, formatLabel, inferYearPeriods } from "../src/domain.js";

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

const periods = inferYearPeriods(entries);
const withYears = assignPeriodYears(entries, periods);

const books = withYears.map((entry, index) => ({
  id: `seed-${String(index + 1).padStart(3, "0")}`,
  ...entry,
  addedAt: index,
}));

const header = [
  "// Сгенерировано tools/build-seed.mjs из списка «Прочитанные книги». Не редактировать вручную.",
  `// Записей и книг: ${books.length}; повторные прочтения сохранены отдельными записями.`,
  "// Годы выведены из парных отметок в docx: границы периода принадлежат этому году.",
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
const suspicious = books.filter((book) => !book.author && /\s[-–—]\s/.test(book.title));

const seen = new Map();
for (const book of books) {
  const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
const repeated = [...seen.values()].filter((count) => count > 1);

console.log(`Источник: ${raw.length}`);
console.log(`Распознано: ${entries.length}`);
console.log(`Итого книг: ${books.length}, номера 1..${maxNumber}`);
console.log(`Повторных прочтений: ${repeated.reduce((sum, count) => sum + count - 1, 0)} (${repeated.length} названий)`);
console.log(`Без автора: ${noAuthor}`);
console.log(`С годом: ${withYear}, без года: ${books.length - withYear}`);
console.log(
  `Периоды: ${periods
    .map((period) => `${period.year} (№${entries[period.start].number}..${entries[period.end].number})`)
    .join(", ")}`,
);
for (const [format, count] of formats) console.log(`  ${formatLabel(format)}: ${count}`);
console.log(`Подозрительные названия без автора: ${suspicious.length}`);
console.log("Примеры:");
for (const book of books.slice(0, 3)) console.log(" ", JSON.stringify(book));
for (const book of books.slice(-2)) console.log(" ", JSON.stringify(book));
