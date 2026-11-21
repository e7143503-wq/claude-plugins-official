"""Готовит шрифт с кириллицей для экспорта в PDF (подмножество DejaVu Sans).

Запуск (после npm install):
    .venv/bin/pip install fonttools
    .venv/bin/python tools/make_font.py
"""
import base64
import io
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "dejavu-fonts-ttf" / "ttf" / "DejaVuSans.ttf"
OUT = ROOT / "assets" / "vendor" / "pdf-font.js"

# Латиница, расширенная латиница, кириллица, знаки пунктуации, валюты, стрелки, математика
UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x250)) + list(range(0x370, 0x400))
    + list(range(0x400, 0x530)) + list(range(0x2000, 0x2070)) + list(range(0x20A0, 0x20C0))
    + list(range(0x2100, 0x2200)) + list(range(0x2190, 0x2200)) + list(range(0x2200, 0x2300))
    + [0x25CF, 0x25CB, 0x25A0, 0x25A1, 0x2713, 0x2714, 0x2717]
)

opts = subset.Options()
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
font = TTFont(SRC)
sub = subset.Subsetter(opts)
sub.populate(unicodes=UNICODES)
sub.subset(font)
buf = io.BytesIO()
font.save(buf)
data = buf.getvalue()
OUT.write_text(
    "// DejaVu Sans (подмножество), лицензия: Bitstream Vera / DejaVu — свободная\n"
    f'window.TS_PDF_FONT="{base64.b64encode(data).decode()}";\n',
    encoding="utf-8",
)
print(f"{OUT.name}: {len(data) / 1024:.0f} KB")
