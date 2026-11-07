const HEADER_RE = /^прочитанные книги:?$/i;
const MARKER_RE = /\s*\((?:аудио\s*книга|книга с работы)\)/gi;
const AUDIO_RE = /\(аудио\s*книга\)/i;
const YEAR_RE = /(?:^|\s)(20\d{2})\s*(?:год|г\.?)\s*$/i;
const SEPARATOR_RE = /(?:\s+[-–—]\s*|\s*[-–—]\s+)/g;
const AUTHOR_START_RE = /^[A-ZА-ЯЁ]/;

function clean(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseEntry(raw) {
  if (typeof raw !== "string") return null;

  let text = clean(raw);
  if (!text || HEADER_RE.test(text)) return null;

  const format = AUDIO_RE.test(text) ? "audio" : "book";

  text = clean(text.replace(MARKER_RE, " "));

  let year = null;
  const yearMatch = text.match(YEAR_RE);
  if (yearMatch) {
    year = Number(yearMatch[1]);
    text = text.slice(0, yearMatch.index).trim();
  }

  let title = text;
  let author = "";

  const separators = [...text.matchAll(SEPARATOR_RE)];
  const last = separators.at(-1);
  if (last) {
    const left = text.slice(0, last.index).trim();
    const right = text.slice(last.index + last[0].length).trim();
    if (left && right && right.length <= 300 && AUTHOR_START_RE.test(right)) {
      title = left;
      author = right;
    }
  }

  title = clean(title).replace(/[-–—]\s*$/, "").trim();
  if (!title) return null;

  return {
    title,
    author: clean(author),
    format,
    year,
  };
}
