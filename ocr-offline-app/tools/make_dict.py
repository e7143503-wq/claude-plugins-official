"""Генерирует частотные словари для «логического» исправления слов.

Источник данных — пакет wordfreq (данные CC BY-SA 4.0, © Robyn Speer и др.).
Запуск:
    python -m venv .venv && .venv/bin/pip install wordfreq
    .venv/bin/python tools/make_dict.py

Формат файла assets/dict/<lang>.js:
    TS_DICT.<lang> = "53|слово слово\\n52|слово ..."
каждая строка — частота по шкале Zipf * 10 и слова с этой частотой.
"""
import re
from collections import defaultdict
from pathlib import Path

import wordfreq

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "dict"

LANGS = {
    # язык: (сколько слов взять, шаблон допустимого слова)
    "ru": (230_000, re.compile(r"^[а-яё]+(?:-[а-яё]+)*$")),
    "en": (90_000, re.compile(r"^[a-z]+(?:'[a-z]+)?$")),
}


def build(lang, limit, pattern):
    groups = defaultdict(list)
    seen = set()
    for word in wordfreq.top_n_list(lang, limit):
        if not pattern.match(word):
            continue
        # одиночные буквы оставляем только реальные слова
        if len(word) == 1 and word not in ("а", "в", "и", "к", "о", "с", "у", "я", "a", "i"):
            continue
        key = word.replace("ё", "е")
        if key in seen:
            continue
        seen.add(key)
        z = int(round(wordfreq.zipf_frequency(word, lang) * 10))
        groups[z].append(key)
    lines = [f"{z}|{' '.join(ws)}" for z, ws in sorted(groups.items(), reverse=True)]
    body = "\\n".join(lines)
    js = (
        "// Частотный словарь (wordfreq, CC BY-SA 4.0). Сгенерировано tools/make_dict.py\n"
        f'(window.TS_DICT=window.TS_DICT||{{}}).{lang}="{body}";\n'
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{lang}.js").write_text(js, encoding="utf-8")
    print(f"{lang}: {len(seen)} слов, {len(js.encode()) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    for lang, (limit, pattern) in LANGS.items():
        build(lang, limit, pattern)
