"""Извлекает нумерованный список книг из docx в tools/raw-lines.json.

Каждая запись — {"number": 1..765, "text": "..."}. Номер соответствует
видимому номеру пункта в документе (нумерация идёт одним списком).

Использование:
    python tools/extract_docx.py "C:\\Users\\user\\Desktop\\Книги.docx"
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from docx import Document


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\Desktop\Книги.docx")
    if not source.exists():
        print(f"Не найден файл: {source}", file=sys.stderr)
        return 1

    document = Document(source)
    entries: list[dict[str, object]] = []
    number = 0

    for paragraph in document.paragraphs:
        text = paragraph.text.replace("\ufeff", " ").strip()
        if not text:
            continue
        if text.rstrip(":").strip().lower() == "прочитанные книги":
            continue
        number += 1
        entries.append({"number": number, "text": text})

    target = Path(__file__).with_name("raw-lines.json")
    target.write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Извлечено записей: {len(entries)}, номера 1..{number} -> {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
