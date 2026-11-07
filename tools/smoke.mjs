import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filterBooks, pluralBooks, sortBooks } from "../src/domain.js";
import { SEED } from "../src/seed.js";
import { createStaticServer } from "./server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromePath =
  process.env.CHROME_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(existsSync);

if (!chromePath) throw new Error("Не найден Chrome/Edge. Укажите CHROME_PATH.");

const profile = path.join(root, "tmp", "chrome-smoke");
const screenshots = path.join(root, "screenshots");
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
await mkdir(screenshots, { recursive: true });

let server = null;
let base = process.env.SMOKE_URL || process.argv[2] || "";
if (base) {
  if (!base.endsWith("/")) base += "/";
} else {
  server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
}

process.on("exit", () => {
  try {
    chrome.kill();
  } catch {
    // уже остановлен
  }
});

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    "--hide-scrollbars",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForChrome() {
  const activePortFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 200; i += 1) {
    if (existsSync(activePortFile)) {
      const [portText] = readFileSync(activePortFile, "utf8").split("\n");
      if (portText) return Number(portText);
    }
    if (chrome.exitCode !== null) throw new Error(`Chrome завершился с кодом ${chrome.exitCode}`);
    await sleep(100);
  }
  throw new Error("Chrome не открыл порт отладки");
}

const devtoolsPort = await waitForChrome();
let target = null;
for (let i = 0; i < 100; i += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
    const targets = await response.json();
    target = targets.find((item) => item.type === "page");
    if (target) break;
  } catch {
    // Chrome ещё поднимается
  }
  await sleep(100);
}
if (!target) throw new Error("Не найден target страницы в Chrome");

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [];
let messageId = 0;

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    exceptions.push(details.exception?.description || details.text);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(predicate, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {
      // страница могла перезагружаться
    }
    await sleep(80);
  }
  throw new Error(`Таймаут: ${label}`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(screenshots, name), Buffer.from(data, "base64"));
  console.log(`  screenshot: screenshots/${name}`);
}

function text(selector) {
  return evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
}

function count(selector = ".book") {
  return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}

async function setInput(selector, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Emulation.setScrollbarsHidden", { hidden: true });

const expected = SEED.length;
console.log(`Проверяю приложение: ${expected} книг в seed`);

await send("Page.navigate", { url: base });
await waitFor(async () => (await count()) === expected, "первый рендер списка");

assert.equal(await count(), expected, "все книги отрисованы");
assert.equal((await text("#total-count")).trim(), `${expected} ${pluralBooks(expected)}`);
assert.ok((await text("#audio-count")).includes("аудио"), "в подзаголовке есть счётчик аудио");
const yearLabels = await evaluate(
  '[...document.querySelectorAll(".group-letter")].map((heading) => heading.textContent)',
);
assert.deepEqual(yearLabels, [
  "До 2018",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026",
]);
const knownNumber = await evaluate(`(() => {
  const row = [...document.querySelectorAll(".book")].find(
    (item) => item.querySelector(".book-title")?.textContent === "Пробуждение",
  );
  return row?.querySelector(".book-number")?.textContent ?? "";
})()`);
assert.equal(knownNumber, "639", "номер книги совпадает с docx");
const yearMarks = await evaluate(`(() => {
  const labels = [...document.querySelectorAll(".group-letter, .year-end")].map((element) => element.textContent);
  return {
    endCount: document.querySelectorAll(".year-end").length,
    count2025: labels.filter((label) => label === "2025").length,
    count2018: labels.filter((label) => label === "2018").length,
    count2026: labels.filter((label) => label === "2026").length,
  };
})()`);
assert.deepEqual(yearMarks, { endCount: 7, count2025: 2, count2018: 1, count2026: 1 });
assert.equal(await text("#empty-title"), "Список пуст");

const swState = await waitFor(async () => {
  const value = await evaluate(
    'navigator.serviceWorker.getRegistration().then((registration) => registration?.active?.state ?? "none")',
    true,
  );
  return value === "activated" ? value : null;
}, "активация service worker");
assert.equal(swState, "activated");

await screenshot("home.png");

await evaluate(`(() => {
  const toolbarHeight = document.querySelector("#toolbar").getBoundingClientRect().height;
  const heading = [...document.querySelectorAll(".group-letter")].find((item) => item.textContent === "2025");
  window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - toolbarHeight - 24);
})()`);
await sleep(300);
await screenshot("year-start.png");

await evaluate(`(() => {
  const end = [...document.querySelectorAll(".year-end")].find((item) => item.textContent === "2025");
  window.scrollTo(0, end.getBoundingClientRect().top + window.scrollY - 420);
})()`);
await sleep(300);
await screenshot("year-end.png");

await evaluate(`(() => {
  const select = document.querySelector("#sort");
  select.value = "title";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await waitFor(async () => (await count(".group-letter")) > 20, "алфавитные группы для проверки sticky");
await evaluate(`(() => {
  const toolbarHeight = document.querySelector("#toolbar").getBoundingClientRect().height;
  const header = [...document.querySelectorAll(".group-letter")].find((item) => item.textContent === "Г");
  const absoluteTop = header.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, absoluteTop - toolbarHeight + 40);
})()`);
await sleep(350);
const sticky = await evaluate(`(() => {
  const toolbar = document.querySelector("#toolbar").getBoundingClientRect();
  const header = [...document.querySelectorAll(".group-letter")].find((item) => item.textContent === "Г");
  return { toolbarTop: toolbar.top, toolbarHeight: toolbar.height, headerTop: header.getBoundingClientRect().top };
})()`);
console.log("  sticky:", JSON.stringify(sticky));
assert.ok(Math.abs(sticky.toolbarTop) < 1, "панель поиска прилипает к верху");
assert.ok(
  Math.abs(sticky.headerTop - sticky.toolbarHeight) < 2,
  `заголовок группы стоит под панелью (${sticky.headerTop} vs ${sticky.toolbarHeight})`,
);
await screenshot("home-scrolled.png");

await evaluate(`(() => {
  const select = document.querySelector("#sort");
  select.value = "order";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  window.scrollTo(0, 0);
})()`);
await waitFor(
  async () =>
    (await evaluate('document.querySelector(".group-letter")?.textContent')) === "До 2018",
  "возврат к хронологическому порядку",
);

const harry = filterBooks(SEED, { query: "гарри" }).length;
await setInput("#search", "гарри");
await waitFor(async () => (await count()) === harry, "поиск по «гарри»");
assert.ok((await text("#result-text")).includes(`${harry} из ${expected}`), "показан счётчик результата");
await screenshot("search.png");

await click("#clear-search");
await waitFor(async () => (await count()) === expected, "очистка поиска");

const audio = filterBooks(SEED, { format: "audio" }).length;
const regular = filterBooks(SEED, { format: "book" }).length;
await click('[data-format="audio"]');
await waitFor(async () => (await count()) === audio, "фильтр аудио");
assert.ok((await text("#result-text")).includes(`${audio} из ${expected}`));
await click('[data-format="book"]');
await waitFor(async () => (await count()) === regular, "фильтр обычных книг");
assert.ok((await text("#result-text")).includes(`${regular} из ${expected}`));
await click('[data-format="all"]');
await waitFor(async () => (await count()) === expected, "сброс фильтра");

const newest = sortBooks(SEED, "new")[0];
await evaluate(`(() => {
  const select = document.querySelector("#sort");
  select.value = "new";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await waitFor(
  async () =>
    (await evaluate('document.querySelector(".book .book-title")?.textContent')) === newest.title,
  "сортировка «сначала новые»",
);
assert.equal(await count(".group-letter"), 0, "при сортировке «новые» нет буквенных групп");
await evaluate(`(() => {
  const select = document.querySelector("#sort");
  select.value = "title";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await waitFor(async () => (await count(".group-letter")) > 0, "возврат сортировки по алфавиту");

await click("#menu-button");
assert.equal(await evaluate('document.querySelector("#menu").hidden'), false, "меню открывается");
assert.ok((await text("#menu")).includes("Экспорт"), "в меню есть экспорт");
await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
assert.equal(await evaluate('document.querySelector("#menu").hidden'), true, "меню закрывается по Escape");

await evaluate('window.print = () => { window.__printed = true; }');
await click("#menu-button");
await click("#pdf-button");
const printState = await evaluate(`(() => {
  const labels = [...document.querySelectorAll(".print-year, .print-year-end")].map(
    (element) => element.textContent,
  );
  return {
    printed: window.__printed === true,
    entries: document.querySelectorAll(".print-entry").length,
    years: [...document.querySelectorAll(".print-year")].map((element) => element.textContent),
    endCount: document.querySelectorAll(".print-year-end").length,
    count2025: labels.filter((label) => label === "2025").length,
  };
})()`);
assert.equal(printState.printed, true, "кнопка PDF открывает печать");
assert.equal(printState.entries, expected, "в PDF попадают все книги");
assert.deepEqual(printState.years, [
  "До 2018",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026",
]);
assert.equal(printState.endCount, 7);
assert.equal(printState.count2025, 2, "в PDF год 2025 тоже стоит в начале и конце");
const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
const pdfBytes = Buffer.from(pdf.data, "base64");
assert.ok(pdfBytes.length > 10000, "PDF сгенерировался");
await writeFile(path.join(screenshots, "export.pdf"), pdfBytes);
console.log(`  PDF: screenshots/export.pdf (${pdfBytes.length} байт)`);
await evaluate('document.querySelector("#print-doc").replaceChildren()');

await setInput("#search", "нет такой книги 987654");
await waitFor(async () => (await text("#empty-title")) === "Ничего не нашлось", "пустой результат");
await click("#empty-action");
await waitFor(async () => (await count()) === expected, "сброс через пустое состояние");

await click("#add-button");
await waitFor(
  async () => (await evaluate('document.querySelector("#sheet-layer").hidden === false')),
  "открытие формы",
);
await sleep(420);
const sheetBox = await evaluate(`(() => {
  const rect = document.querySelector("#editor").getBoundingClientRect();
  return { top: rect.top, height: rect.height };
})()`);
assert.ok(sheetBox.height > 420, `форма раскрыта по высоте (${sheetBox.height})`);
assert.ok(sheetBox.top >= 0, "форма не выходит за верхний край");
await setInput("#book-title", "Тестовая книга");
await setInput("#book-author", "Тестовый Автор");
await setInput("#book-year", "2024");
await click('input[name="format"][value="audio"]');
await screenshot("editor.png");

await evaluate('document.querySelector("#book-form").requestSubmit()');
await waitFor(
  async () => (await evaluate('document.querySelector("#sheet-layer").classList.contains("is-open")')) === false,
  "закрытие формы после добавления",
);
await sleep(350);
assert.equal(await count(), expected + 1, "книга добавилась");
assert.ok((await text("#toast-text")).includes("добавлена"), "тост о добавлении");
assert.ok(
  (await evaluate('localStorage.getItem("books:v4").includes("Тестовая книга")')),
  "книга сохранена в localStorage",
);
assert.ok(
  await evaluate(`[...document.querySelectorAll(".book")].some((row) => row.textContent.includes("Тестовая книга"))`),
  "новая книга видна в списке",
);
const addedNumber = await evaluate(`(() => {
  const row = [...document.querySelectorAll(".book")].find(
    (item) => item.querySelector(".book-title")?.textContent === "Тестовая книга",
  );
  return row?.querySelector(".book-number")?.textContent ?? "";
})()`);
assert.equal(addedNumber, "766", "новая книга получает следующий номер docx");

await evaluate(`(() => {
  const row = [...document.querySelectorAll(".book")].find((item) => item.textContent.includes("Тестовая книга"));
  row.click();
})()`);
await waitFor(
  async () => (await evaluate('document.querySelector("#sheet-layer").classList.contains("is-open")')),
  "открытие формы редактирования",
);
assert.equal(await evaluate('document.querySelector("#book-title").value'), "Тестовая книга");
await setInput("#book-title", "Тестовая книга 2");
await evaluate('document.querySelector("#book-form").requestSubmit()');
await sleep(400);
assert.equal(await count(), expected + 1, "редактирование не меняет количество");
assert.ok(
  await evaluate(`[...document.querySelectorAll(".book")].some((row) => row.textContent.includes("Тестовая книга 2"))`),
  "новое название видно",
);
assert.ok(
  (await evaluate('localStorage.getItem("books:v4").includes("Тестовая книга 2")')),
  "новое название сохранено",
);

await evaluate(`(() => {
  const row = [...document.querySelectorAll(".book")].find((item) => item.textContent.includes("Тестовая книга 2"));
  row.click();
})()`);
await waitFor(
  async () => (await evaluate('document.querySelector("#sheet-layer").classList.contains("is-open")')),
  "открытие формы для удаления",
);
await click("#delete-button");
assert.equal((await text("#delete-button")).trim(), "Нажмите ещё раз", "удаление требует подтверждения");
await click("#delete-button");
await waitFor(async () => (await count()) === expected, "удаление книги");
await sleep(350);
assert.ok((await text("#toast-text")).includes("удалена"), "тост об удалении");
await screenshot("toast.png");

await click("#toast-action");
await waitFor(async () => (await count()) === expected + 1, "отмена удаления");
assert.ok((await text("#toast-text")).includes("восстановлена"), "тост о восстановлении");

await evaluate(`(() => {
  const row = [...document.querySelectorAll(".book")].find((item) => item.textContent.includes("Тестовая книга 2"));
  row.click();
})()`);
await waitFor(
  async () => (await evaluate('document.querySelector("#sheet-layer").classList.contains("is-open")')),
  "повторное открытие для удаления",
);
await click("#delete-button");
await click("#delete-button");
await waitFor(async () => (await count()) === expected, "удаление тестовой книги");

await evaluate('localStorage.removeItem("books:v4")');
await send("Page.reload", { ignoreCache: true });
await waitFor(async () => (await count()) === expected, "перезагрузка с seed-списком");
await evaluate("window.scrollTo(0, 0)");
await sleep(300);
assert.equal(await evaluate("window.scrollY"), 0, "после перезагрузки список показан сверху");

await screenshot("home.png");

await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-color-scheme", value: "dark" }],
});
await sleep(250);
await screenshot("home-dark.png");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

const inputValue = await evaluate('document.querySelector("#search").value');
assert.equal(inputValue, "", "поиск пуст после перезагрузки");

await send("Network.enable");
await send("Network.emulateNetworkConditions", {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
  connectionType: "none",
});
await send("Page.reload", { ignoreCache: true });
await waitFor(async () => (await count()) === expected, "офлайн-перезагрузка из service worker", 15000);
assert.equal((await text("#total-count")).trim(), `${expected} ${pluralBooks(expected)}`);
await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: "wifi",
});
console.log("  offline reload: OK");

await evaluate(`(() => {
  const data = JSON.parse(localStorage.getItem("books:v4"));
  const legacy = {
    version: 2,
    books: data.books.map((book) => ({
      ...book,
      year: null,
      format: book.format === "audio" ? "audio" : "paper",
    })),
  };
  localStorage.removeItem("books:v4");
  localStorage.setItem("books:v2", JSON.stringify(legacy));
})()`);
await send("Page.reload", { ignoreCache: true });
await waitFor(async () => (await count()) === expected, "миграция старого localStorage");
const migrated = await evaluate(`(() => {
  const stored = JSON.parse(localStorage.getItem("books:v4"));
  const byNumber = new Map(stored.books.map((book) => [book.number, book]));
  const row = [...document.querySelectorAll(".book")].find(
    (item) => item.querySelector(".book-title")?.textContent === "Пробуждение",
  );
  const regularRow = [...document.querySelectorAll(".book")].find(
    (item) => item.querySelector(".book-title")?.textContent === "Дом у чертова озера",
  );
  return {
    number: row?.querySelector(".book-number")?.textContent ?? "",
    audioIcon: row?.querySelector(".book-icon")?.classList.contains("is-audio") ?? false,
    regularFormat: regularRow?.querySelector(".book-icon")?.classList.contains("is-book") ?? false,
    year2018: byNumber.get(355)?.year ?? null,
    year2025: byNumber.get(639)?.year ?? null,
    year2026: byNumber.get(729)?.year ?? null,
    hasV4: Boolean(localStorage.getItem("books:v4")),
    hasV2: Boolean(localStorage.getItem("books:v2")),
  };
})()`);
assert.deepEqual(migrated, {
  number: "639",
  audioIcon: true,
  regularFormat: true,
  year2018: 2018,
  year2025: 2025,
  year2026: 2026,
  hasV4: true,
  hasV2: true,
});
console.log("  migration v2 -> v4: OK");

if (exceptions.length) {
  throw new Error(`Ошибки на странице:\n${exceptions.join("\n")}`);
}

console.log("Smoke OK: 765 записей, годы, номера, поиск, фильтр, CRUD, PDF, миграция и офлайн.");
console.log(`Скриншоты: ${screenshots}`);

await Promise.race([send("Browser.close").catch(() => {}), sleep(1000)]);
ws.close();
server?.close();
chrome.kill();
