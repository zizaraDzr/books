import { SEED } from "./seed.js";
import {
  filterBooks,
  formatLabel,
  groupBooksByPeriod,
  groupBooksNewest,
  pluralBooks,
  sortBooks,
  validateBookInput,
} from "./domain.js";
import {
  addBook,
  fromExport,
  loadBooks,
  newId,
  removeBook,
  restoreBook,
  saveBooks,
  toExport,
  updateBook,
} from "./store.js";

const ICONS = {
  audio: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20"/></svg>`,
};

const $ = (selector) => document.querySelector(selector);

const els = {
  page: $("#page"),
  list: $("#book-list"),
  empty: $("#empty"),
  emptyTitle: $("#empty-title"),
  emptyText: $("#empty-text"),
  emptyAction: $("#empty-action"),
  totalCount: $("#total-count"),
  audioCount: $("#audio-count"),
  search: $("#search"),
  clearSearch: $("#clear-search"),
  chips: $("#format-chips"),
  sort: $("#sort"),
  toolbar: $("#toolbar"),
  resultBar: $("#result-bar"),
  resultText: $("#result-text"),
  resetFilters: $("#reset-filters"),
  addButton: $("#add-button"),
  menuButton: $("#menu-button"),
  menu: $("#menu"),
  pdfButton: $("#pdf-button"),
  exportButton: $("#export-button"),
  importButton: $("#import-button"),
  importFile: $("#import-file"),
  sheetLayer: $("#sheet-layer"),
  sheet: $("#editor"),
  sheetTitle: $("#sheet-title"),
  closeSheet: $("#close-sheet"),
  form: $("#book-form"),
  title: $("#book-title"),
  author: $("#book-author"),
  year: $("#book-year"),
  formatGroup: $("#format-group"),
  titleError: $("#title-error"),
  formatError: $("#format-error"),
  yearError: $("#year-error"),
  saveButton: $("#save-button"),
  deleteButton: $("#delete-button"),
  toast: $("#toast"),
  toastText: $("#toast-text"),
  toastAction: $("#toast-action"),
  printDoc: $("#print-doc"),
};

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const stored = loadBooks(storage, SEED);

const state = {
  books: stored.books,
  query: "",
  format: "all",
  sort: "order",
  editingId: null,
  deleteArmed: false,
  snapshot: "",
  lastFocus: null,
};

let searchTimer = 0;
let deleteTimer = 0;
let toastTimer = 0;

function checkedFormat() {
  return els.form.querySelector('input[name="format"]:checked')?.value ?? "book";
}

function formSnapshot() {
  return JSON.stringify([els.title.value, els.author.value, els.year.value, checkedFormat()]);
}

function isDirty() {
  return formSnapshot() !== state.snapshot;
}

function save() {
  return saveBooks(storage, state.books);
}

function cancelPendingSearch() {
  window.clearTimeout(searchTimer);
}

function updateHeader() {
  els.totalCount.textContent = `${state.books.length} ${pluralBooks(state.books.length)}`;
  const audio = state.books.filter((book) => book.format === "audio").length;
  els.audioCount.textContent = audio ? ` · ${audio} аудио` : "";
}

function createBookRow(book, { showYear = true } = {}) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "book";
  row.dataset.id = book.id;
  row.setAttribute(
    "aria-label",
    [
      book.number ? `Книга ${book.number}` : "Книга",
      book.title,
      book.author,
      showYear && book.year ? String(book.year) : "",
      formatLabel(book.format),
    ]
      .filter(Boolean)
      .join(", ") + ". Изменить книгу",
  );

  const number = document.createElement("span");
  number.className = "book-number";
  number.textContent = book.number ?? "—";
  number.setAttribute("aria-hidden", "true");

  const icon = document.createElement("span");
  icon.className = `book-icon is-${book.format}`;
  icon.innerHTML = ICONS[book.format] ?? ICONS.book;

  const text = document.createElement("span");
  text.className = "book-text";

  const title = document.createElement("span");
  title.className = "book-title";
  title.textContent = book.title;
  text.append(title);

  const metaParts = [];
  if (book.author) metaParts.push(book.author);
  if (showYear && book.year) metaParts.push(String(book.year));
  if (metaParts.length) {
    const meta = document.createElement("span");
    meta.className = "book-meta";
    meta.textContent = metaParts.join(" · ");
    text.append(meta);
  }

  row.append(number, icon, text);
  return row;
}

function appendGroup(fragment, label, ariaLabel, books, { showYear = true, endLabel = "" } = {}) {
  const section = document.createElement("section");
  section.className = "group";
  const heading = document.createElement("h2");
  heading.className = "group-letter";
  heading.textContent = label;
  heading.setAttribute("aria-label", ariaLabel);
  section.append(heading);
  for (const book of books) section.append(createBookRow(book, { showYear }));
  if (endLabel) {
    const end = document.createElement("div");
    end.className = "year-end";
    end.textContent = endLabel;
    end.setAttribute("aria-hidden", "true");
    section.append(end);
  }
  fragment.append(section);
}

function renderList() {
  const filtered = filterBooks(state.books, { query: state.query, format: state.format });
  const isEmpty = filtered.length === 0;
  const filtersActive = state.query.trim() !== "" || state.format !== "all";

  els.list.replaceChildren();
  els.list.hidden = isEmpty;
  els.empty.hidden = !isEmpty;

  if (!isEmpty) {
    const fragment = document.createDocumentFragment();
    if (state.sort === "order" && !filtersActive) {
      for (const group of groupBooksByPeriod(filtered)) {
        appendGroup(
          fragment,
          group.label,
          group.year === null ? group.label : `${group.year} год`,
          group.books,
          { showYear: false, endLabel: group.showEnd ? group.label : "" },
        );
      }
    } else if (state.sort === "order") {
      for (const book of sortBooks(filtered, "order")) {
        fragment.append(createBookRow(book));
      }
    } else {
      for (const group of groupBooksNewest(filtered)) {
        appendGroup(
          fragment,
          group.label,
          group.year === null ? group.label : `${group.year} год`,
          group.books,
          { showYear: false },
        );
      }
    }
    els.list.append(fragment);
  } else {
    const isLibraryEmpty = state.books.length === 0;
    els.emptyTitle.textContent = isLibraryEmpty ? "Список пуст" : "Ничего не нашлось";
    els.emptyText.textContent = isLibraryEmpty
      ? "Добавьте первую книгу — она сохранится на этом устройстве."
      : "Попробуйте изменить запрос или сбросить фильтр по формату.";
    els.emptyAction.textContent = isLibraryEmpty ? "Добавить книгу" : "Сбросить фильтры";
  }

  els.resultBar.hidden = !filtersActive;
  if (filtersActive) {
    els.resultText.textContent = `Найдено: ${filtered.length} из ${state.books.length}`;
  }

  updateHeader();
  syncToolbarHeight();
}

function syncToolbarHeight() {
  const height = Math.round(els.toolbar.getBoundingClientRect().height);
  if (height > 0) document.documentElement.style.setProperty("--toolbar-h", `${height}px`);
}

function setActiveChip(format) {
  for (const chip of els.chips.querySelectorAll("[data-format]")) {
    const active = chip.dataset.format === format;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  }
}

function resetFilters() {
  cancelPendingSearch();
  state.query = "";
  state.format = "all";
  els.search.value = "";
  els.clearSearch.hidden = true;
  setActiveChip("all");
  renderList();
  window.scrollTo(0, 0);
}

function setError(name, message) {
  const target = els[`${name}Error`];
  if (!target) return;
  target.textContent = message ?? "";
  const input = name === "title" ? els.title : name === "year" ? els.year : null;
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearErrors() {
  setError("title", "");
  setError("year", "");
  setError("format", "");
}

function showErrors(errors) {
  setError("title", errors.title);
  setError("year", errors.year);
  setError("format", errors.format);
  if (errors.title) {
    els.title.focus({ preventScroll: true });
  } else if (errors.format) {
    els.formatGroup.querySelector("input")?.focus({ preventScroll: true });
  } else if (errors.year) {
    els.year.focus({ preventScroll: true });
  }
}

function resetDeleteButton() {
  window.clearTimeout(deleteTimer);
  state.deleteArmed = false;
  els.deleteButton.textContent = "Удалить книгу";
  els.deleteButton.classList.remove("is-armed");
}

function openEditor(id = null) {
  setMenuOpen(false);
  window.clearTimeout(deleteTimer);
  clearErrors();

  const book = id ? state.books.find((item) => item.id === id) : null;
  if (id && !book) return;

  state.lastFocus = document.activeElement;
  state.editingId = book ? book.id : null;
  resetDeleteButton();
  els.form.reset();

  if (book) {
    els.sheetTitle.textContent = "Изменить книгу";
    els.title.value = book.title;
    els.author.value = book.author;
    els.year.value = book.year ? String(book.year) : "";
    const radio = els.form.querySelector(`input[name="format"][value="${book.format}"]`);
    if (radio) radio.checked = true;
    els.deleteButton.hidden = false;
    els.saveButton.textContent = "Сохранить";
  } else {
    els.sheetTitle.textContent = "Новая книга";
    els.deleteButton.hidden = true;
    els.saveButton.textContent = "Добавить";
  }

  state.snapshot = formSnapshot();
  els.sheetLayer.hidden = false;
  els.page.inert = true;
  els.page.setAttribute("aria-hidden", "true");
  document.body.classList.add("has-sheet");
  void els.sheet.offsetHeight;
  requestAnimationFrame(() => els.sheetLayer.classList.add("is-open"));
  window.setTimeout(() => {
    if (!els.sheetLayer.hidden) els.title.focus({ preventScroll: true });
  }, 230);
}

function closeEditor(force = false) {
  if (els.sheetLayer.hidden) return;
  if (!force && isDirty() && !window.confirm("Закрыть без сохранения?")) return;

  resetDeleteButton();
  els.sheetLayer.classList.remove("is-open");
  els.page.inert = false;
  els.page.removeAttribute("aria-hidden");
  document.body.classList.remove("has-sheet");
  state.editingId = null;

  const layer = els.sheetLayer;
  const focusTarget = state.lastFocus;
  window.setTimeout(() => {
    if (layer.classList.contains("is-open")) return;
    layer.hidden = true;
    if (focusTarget?.isConnected && typeof focusTarget.focus === "function") {
      focusTarget.focus({ preventScroll: true });
    }
  }, 260);
}

function requestClose() {
  closeEditor(false);
}

function onSubmit(event) {
  event.preventDefault();
  const result = validateBookInput({
    title: els.title.value,
    author: els.author.value,
    year: els.year.value,
    format: checkedFormat(),
  });

  if (!result.ok) {
    showErrors(result.errors);
    return;
  }

  let addedId = null;
  if (state.editingId) {
    state.books = updateBook(state.books, state.editingId, result.value);
  } else {
    addedId = newId();
    state.books = addBook(state.books, result.value, { id: addedId });
    cancelPendingSearch();
    state.query = "";
    state.format = "all";
    els.search.value = "";
    els.clearSearch.hidden = true;
    setActiveChip("all");
  }

  const saved = save();
  closeEditor(true);
  renderList();

  if (addedId) {
    highlightBook(addedId);
    showToast(saved ? "Книга добавлена" : "Добавлено, но сохранить не удалось");
  } else {
    showToast(saved ? "Изменения сохранены" : "Изменено, но сохранить не удалось");
  }
}

function highlightBook(id) {
  const row = [...els.list.querySelectorAll(".book")].find((item) => item.dataset.id === id);
  if (!row) return;
  row.classList.add("is-highlight");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    row.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  });
  window.setTimeout(() => row.classList.remove("is-highlight"), 2300);
}

function onDelete() {
  if (!state.editingId) return;

  if (!state.deleteArmed) {
    state.deleteArmed = true;
    els.deleteButton.textContent = "Нажмите ещё раз";
    els.deleteButton.classList.add("is-armed");
    deleteTimer = window.setTimeout(resetDeleteButton, 3200);
    return;
  }

  const id = state.editingId;
  const { books, removed, index } = removeBook(state.books, id);
  if (!removed) return;

  state.books = books;
  save();
  closeEditor(true);
  renderList();

  showToast("Книга удалена", {
    actionLabel: "Отменить",
    duration: 6000,
    onAction: () => {
      state.books = restoreBook(state.books, removed, index);
      save();
      renderList();
      showToast("Книга восстановлена");
    },
  });
}

function showToast(message, { actionLabel = "", duration = 4000, onAction = null } = {}) {
  window.clearTimeout(toastTimer);
  els.toastText.textContent = message;

  if (actionLabel) {
    els.toastAction.hidden = false;
    els.toastAction.textContent = actionLabel;
    els.toastAction.onclick = () => {
      hideToast();
      if (onAction) onAction();
    };
  } else {
    els.toastAction.hidden = true;
    els.toastAction.onclick = null;
  }

  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("is-visible"));
  toastTimer = window.setTimeout(hideToast, duration);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  els.toast.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!els.toast.classList.contains("is-visible")) els.toast.hidden = true;
  }, 220);
}

function setMenuOpen(open = false) {
  els.menu.hidden = !open;
  els.menuButton.setAttribute("aria-expanded", String(open));
  if (open) els.menu.querySelector("button")?.focus();
}

async function exportBooks() {
  setMenuOpen(false);
  const json = JSON.stringify(toExport(state.books), null, 2);
  const name = `prochitano-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    if (typeof navigator.share === "function") {
      const file = new File([json], name, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Список книг" });
        return;
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }

  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Файл сохранён");
}

function renderPrintDoc() {
  const doc = els.printDoc;
  doc.replaceChildren();

  const title = document.createElement("h1");
  title.className = "print-title";
  title.textContent = "Прочитано";

  const audio = state.books.filter((book) => book.format === "audio").length;
  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = `${state.books.length} ${pluralBooks(state.books.length)} · ${audio} аудио · ${new Date().toLocaleDateString("ru-RU")}`;

  doc.append(title, meta);

  for (const group of groupBooksByPeriod(state.books)) {
    const heading = document.createElement("h2");
    heading.className = "print-year";
    heading.textContent = group.label;
    doc.append(heading);

    for (const book of group.books) {
      const entry = document.createElement("p");
      entry.className = "print-entry";

      const number = document.createElement("span");
      number.className = "print-number";
      number.textContent = `${book.number}.`;

      const body = document.createElement("span");
      body.className = "print-body";

      const name = document.createElement("span");
      name.className = "print-book-title";
      name.textContent = book.title;

      body.append(name);
      if (book.author) body.append(document.createTextNode(` — ${book.author}`));
      if (book.format === "audio") {
        const format = document.createElement("span");
        format.className = "print-format";
        format.textContent = " · аудио";
        body.append(format);
      }
      entry.append(number, body);
      doc.append(entry);
    }

    if (group.showEnd) {
      const end = document.createElement("div");
      end.className = "print-year-end";
      end.textContent = group.label;
      doc.append(end);
    }
  }
}

function exportPdf() {
  setMenuOpen(false);
  renderPrintDoc();

  const cleanup = () => {
    els.printDoc.replaceChildren();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  try {
    window.print();
  } catch {
    cleanup();
    showToast("Не удалось открыть печать");
  }
}

async function importBooks(file) {
  setMenuOpen(false);
  try {
    const text = await file.text();
    const { books, skipped } = fromExport(JSON.parse(text), SEED);
    const ok = window.confirm(
      `Импортировать ${books.length} ${pluralBooks(books.length)}? Текущий список (${state.books.length}) будет заменён.`,
    );
    if (!ok) return;

    cancelPendingSearch();
    state.books = books;
    state.query = "";
    state.format = "all";
    els.search.value = "";
    els.clearSearch.hidden = true;
    setActiveChip("all");
    save();
    renderList();
    showToast(
      skipped > 0
        ? `Импортировано: ${books.length}, пропущено: ${skipped}`
        : `Импортировано: ${books.length} ${pluralBooks(books.length)}`,
    );
  } catch (error) {
    showToast(error?.message || "Не удалось импортировать файл");
  }
}

function trapFocus(event) {
  const focusable = [...els.sheet.querySelectorAll("button, input, select, textarea, a[href]")].filter(
    (item) => !item.disabled && !item.hidden && item.offsetParent !== null,
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

els.search.addEventListener("input", () => {
  els.clearSearch.hidden = !els.search.value;
  cancelPendingSearch();
  const value = els.search.value;
  searchTimer = window.setTimeout(() => {
    if (state.query === value) return;
    state.query = value;
    renderList();
    window.scrollTo(0, 0);
  }, 120);
});

els.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  cancelPendingSearch();
  state.query = els.search.value;
  els.search.blur();
  renderList();
  window.scrollTo(0, 0);
});

els.clearSearch.addEventListener("click", () => {
  cancelPendingSearch();
  els.search.value = "";
  els.clearSearch.hidden = true;
  state.query = "";
  renderList();
  els.search.focus();
});

els.chips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-format]");
  if (!chip) return;
  state.format = chip.dataset.format;
  setActiveChip(state.format);
  renderList();
  window.scrollTo(0, 0);
});

els.sort.addEventListener("change", () => {
  state.sort = els.sort.value;
  renderList();
  window.scrollTo(0, 0);
});

els.list.addEventListener("click", (event) => {
  const row = event.target.closest(".book");
  if (row) openEditor(row.dataset.id);
});

els.addButton.addEventListener("click", () => openEditor(null));
els.emptyAction.addEventListener("click", () => {
  if (state.books.length === 0) openEditor(null);
  else resetFilters();
});

els.resetFilters.addEventListener("click", resetFilters);

els.closeSheet.addEventListener("click", requestClose);
els.sheetLayer.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-sheet]")) requestClose();
});

els.form.addEventListener("submit", onSubmit);
els.deleteButton.addEventListener("click", onDelete);

els.title.addEventListener("input", () => setError("title", ""));
els.year.addEventListener("input", () => setError("year", ""));
els.formatGroup.addEventListener("change", () => setError("format", ""));

els.menuButton.addEventListener("click", () => setMenuOpen(els.menu.hidden));
els.pdfButton.addEventListener("click", exportPdf);
els.exportButton.addEventListener("click", exportBooks);
els.importButton.addEventListener("click", () => {
  setMenuOpen(false);
  els.importFile.click();
});
els.importFile.addEventListener("change", () => {
  const file = els.importFile.files?.[0];
  els.importFile.value = "";
  if (file) importBooks(file);
});

document.addEventListener("click", (event) => {
  if (els.menu.hidden) return;
  if (event.target.closest("#menu") || event.target.closest("#menu-button")) return;
  setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (!els.sheetLayer.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    } else if (event.key === "Tab") {
      trapFocus(event);
    }
    return;
  }
  if (event.key === "Escape" && !els.menu.hidden) {
    setMenuOpen(false);
    els.menuButton.focus();
  }
});

window.addEventListener(
  "scroll",
  () => {
    if (!els.menu.hidden) setMenuOpen(false);
  },
  { passive: true },
);

window.addEventListener("resize", syncToolbarHeight);
window.addEventListener("orientationchange", () => window.setTimeout(syncToolbarHeight, 250));

if ("ResizeObserver" in window) {
  new ResizeObserver(syncToolbarHeight).observe(els.toolbar);
}

renderList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
