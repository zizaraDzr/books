"""Извлекает текст из docx в tools/raw-lines.json (по одной строке на запись).

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
    lines = [p.text.replace("\ufeff", " ").strip() for p in document.paragraphs]
    lines = [line for line in lines if line]

    target = Path(__file__).with_name("raw-lines.json")
    target.write_text(json.dumps(lines, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Извлечено строк: {len(lines)} -> {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
