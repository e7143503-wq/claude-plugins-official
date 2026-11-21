// Собирает офлайн-ресурсы приложения из node_modules в папку assets/.
// Запуск: npm install && npm run build
// После сборки приложение не требует интернета и открывается двойным щелчком по index.html.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = (p) => join(root, 'assets', p);
const kb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

mkdirSync(out('vendor'), { recursive: true });
mkdirSync(out('lang'), { recursive: true });

function writeJs(file, body) {
  writeFileSync(out(file), body);
  console.log(`  ${file.padEnd(28)} ${kb(Buffer.byteLength(body))}`);
}

// 1. Основная библиотека tesseract.js
copyFileSync(join(nm, 'tesseract.js/dist/tesseract.min.js'), out('vendor/tesseract.min.js'));
console.log('  vendor/tesseract.min.js copied');

// 2. Скрипт воркера. Встраиваем как строку, чтобы создать Worker из Blob —
//    так он работает даже при открытии страницы через file://.
//    Патч: в tesseract.js 7.0.0 при передаче языков объектами {code, data}
//    функция initialize склеивает l.data вместо l.code — исправляем.
let worker = readFileSync(join(nm, 'tesseract.js/dist/worker.min.js'), 'utf8');
const bug = 'return"string"==typeof t?t:t.data})).join("+")';
if (!worker.includes(bug)) throw new Error('Не найден ожидаемый фрагмент в worker.min.js — проверьте версию tesseract.js');
worker = worker.replace(bug, 'return"string"==typeof t?t:t.code})).join("+")');
writeJs('vendor/tess-worker.js', `window.TS_WORKER_SRC=${JSON.stringify(worker)};\n`);

// 3. Ядро (WebAssembly внутри JS). SIMD-версия + запасная для старых браузеров.
const core = (name) => readFileSync(join(nm, 'tesseract.js-core', name), 'utf8');
writeJs('vendor/tess-core-simd.js', `window.TS_CORE_SRC=${JSON.stringify(core('tesseract-core-simd-lstm.wasm.js'))};\n`);
writeJs('vendor/tess-core-basic.js', `window.TS_CORE_SRC=${JSON.stringify(core('tesseract-core-lstm.wasm.js'))};\n`);

// 4. Языковые модели (LSTM best_int, gzip) в base64.
for (const lang of ['rus', 'eng']) {
  const data = readFileSync(join(nm, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`));
  writeJs(`lang/${lang}.js`, `(window.TS_LANG=window.TS_LANG||{}).${lang}="${data.toString('base64')}";\n`);
}

// 5. jsPDF для экспорта в PDF.
copyFileSync(join(nm, 'jspdf/dist/jspdf.umd.min.js'), out('vendor/jspdf.umd.min.js'));
console.log('  vendor/jspdf.umd.min.js copied');

console.log('Готово. Шрифт для PDF и словари собираются отдельно: tools/make_font.py, tools/make_dict.py');
