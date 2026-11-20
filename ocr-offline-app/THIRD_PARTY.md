# Сторонние компоненты

| Компонент | Где лежит | Лицензия |
|---|---|---|
| [tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 | `assets/vendor/tesseract.min.js`, `assets/vendor/tess-worker.js` | Apache-2.0 |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (Tesseract OCR, WebAssembly) | `assets/vendor/tess-core-*.js` | Apache-2.0 |
| Языковые модели Tesseract (`rus`, `eng`, 4.0.0_best_int) через [@tesseract.js-data](https://www.npmjs.com/org/tesseract.js-data) | `assets/lang/` | Apache-2.0 |
| [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 | `assets/vendor/jspdf.umd.min.js` | MIT |
| [DejaVu Sans](https://dejavu-fonts.github.io/), подмножество | `assets/vendor/pdf-font.js` | Bitstream Vera / DejaVu (свободная) |
| Частотные данные [wordfreq](https://github.com/rspeer/wordfreq) 3.1 | `assets/dict/` | CC BY-SA 4.0 |

В `tess-worker.js` внесена одна правка (см. `tools/build.mjs`): в tesseract.js 7.0.0 при передаче языковых моделей объектами `{code, data}` функция `initialize` берёт `data` вместо `code`.

Словари в `assets/dict/` — производные данные wordfreq и распространяются на условиях CC BY-SA 4.0.
