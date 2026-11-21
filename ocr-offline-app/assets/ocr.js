/*
 * ТекстСкан — движок распознавания (Tesseract, WebAssembly) без сети.
 * Все ресурсы (ядро, языковые модели) лежат рядом в папке assets/ и подключаются
 * обычными <script>, поэтому приложение работает даже при открытии index.html двойным щелчком.
 */
(function () {
  'use strict';

  const BASE = 'assets/';
  const loaded = new Map();

  function loadScript(src) {
    if (loaded.has(src)) return loaded.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loaded.delete(src); reject(new Error('Не удалось загрузить файл ' + src + '. Проверьте, что папка assets лежит рядом с index.html.')); };
      document.head.appendChild(s);
    });
    loaded.set(src, p);
    return p;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function simdSupported() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) {
      return false;
    }
  }

  const LANG_FILES = { rus: 'lang/rus.js', eng: 'lang/eng.js' };
  const STATUS_RU = {
    'loading tesseract core': 'Загрузка движка распознавания',
    'initializing tesseract': 'Запуск движка',
    'initialized tesseract': 'Движок запущен',
    'loading language traineddata': 'Загрузка языковых моделей',
    'loaded language traineddata': 'Языковые модели загружены',
    'initializing api': 'Подготовка к распознаванию',
    'initialized api': 'Готово к распознаванию',
    'recognizing text': 'Распознавание текста',
  };

  let worker = null;
  let workerLangs = '';
  let creating = null;
  let progressCb = null;

  async function ensureWorker(langs) {
    const key = langs.join('+');
    if (worker && workerLangs === key) return worker;
    if (creating) { await creating.catch(() => {}); if (worker && workerLangs === key) return worker; }
    creating = (async () => {
      if (worker) { await worker.terminate().catch(() => {}); worker = null; }
      if (typeof WebAssembly !== 'object') throw new Error('Этот браузер не поддерживает WebAssembly. Обновите браузер.');
      progressCb && progressCb({ status: 'Загрузка движка распознавания', progress: 0.05 });
      await loadScript('vendor/tesseract.min.js');
      await loadScript('vendor/tess-worker.js');
      await loadScript(simdSupported() ? 'vendor/tess-core-simd.js' : 'vendor/tess-core-basic.js');
      progressCb && progressCb({ status: 'Загрузка языковых моделей', progress: 0.2 });
      await Promise.all(langs.map((l) => loadScript(LANG_FILES[l])));
      const langData = langs.map((code) => ({ code, data: b64ToBytes(window.TS_LANG[code]) }));
      // Ядро и скрипт воркера склеиваются в один Blob: никаких сетевых запросов и importScripts.
      const workerUrl = URL.createObjectURL(new Blob([window.TS_CORE_SRC, '\n', window.TS_WORKER_SRC], { type: 'application/javascript' }));
      const w = await window.Tesseract.createWorker(langData, 1 /* LSTM */, {
        workerPath: workerUrl,
        corePath: 'inline-core.js',
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => {
          if (!progressCb || !m || !m.status) return;
          const status = STATUS_RU[m.status] || m.status;
          if (m.status === 'recognizing text') progressCb({ status, progress: 0.3 + 0.7 * (m.progress || 0), recognizing: true });
          else progressCb({ status, progress: 0.1 + 0.2 * (m.progress || 0) });
        },
        errorHandler: (e) => console.error(e),
      });
      worker = w;
      workerLangs = key;
      return w;
    })();
    try {
      return await creating;
    } finally {
      creating = null;
    }
  }

  // ---------- Подготовка изображения ----------
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* пробуем через <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } catch (e) {
      throw new Error('Не удалось открыть изображение. Поддерживаются JPG, PNG, WEBP, GIF, BMP, а также HEIC в Safari.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function drawRotated(img, rotation, scale) {
    const w = img.width, h = img.height;
    const swap = rotation % 180 !== 0;
    const cw = Math.max(1, Math.round((swap ? h : w) * scale));
    const ch = Math.max(1, Math.round((swap ? w : h) * scale));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
    return c;
  }

  // Доля «соль-перец» шума: одиночные пиксели, резко отличающиеся от соседей
  function noiseRatio(gray, w, h) {
    let noisy = 0, total = 0;
    const step = Math.max(1, Math.floor((w * h) / 400000));
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1 + (y % step); x < w - 1; x += step) {
        const i = y * w + x;
        const a = gray[i - 1], b = gray[i + 1], c = gray[i - w], d = gray[i + w];
        const mx = Math.max(a, b, c, d), mn = Math.min(a, b, c, d);
        total++;
        if (mx - mn < 40 && Math.abs(gray[i] - (a + b + c + d) / 4) > 90) noisy++;
      }
    }
    return total ? noisy / total : 0;
  }

  function median3(gray, w, h) {
    const out = new Uint8ClampedArray(gray.length);
    const v = new Uint8Array(9);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy)) * w;
          for (let dx = -1; dx <= 1; dx++) v[k++] = gray[yy + Math.min(w - 1, Math.max(0, x + dx))];
        }
        // сортировка вставками 9 значений
        for (let i = 1; i < 9; i++) { const t = v[i]; let j = i - 1; while (j >= 0 && v[j] > t) { v[j + 1] = v[j]; j--; } v[j + 1] = t; }
        out[y * w + x] = v[4];
      }
    }
    return out;
  }

  // Оттенки серого, удаление шума, растяжение контраста, инверсия светлого текста на тёмном фоне
  function enhance(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const W = canvas.width, H = canvas.height;
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;
    const n = W * H;
    let gray = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const a = d[i + 3] / 255;
      gray[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
    }
    const noise = noiseRatio(gray, W, H);
    const denoised = noise > 0.002 && n < 6e6;
    if (denoised) gray = median3(gray, W, H);
    const hist = new Uint32Array(256);
    for (let j = 0; j < n; j++) hist[gray[j]]++;
    let acc = 0, lo = 0, hi = 255, med = 128;
    const loT = n * 0.01, hiT = n * 0.99, medT = n * 0.5;
    let loSet = false, medSet = false;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (!loSet && acc >= loT) { lo = v; loSet = true; }
      if (!medSet && acc >= medT) { med = v; medSet = true; }
      if (acc >= hiT) { hi = v; break; }
    }
    if (hi - lo < 30) { lo = Math.max(0, lo - 30); hi = Math.min(255, hi + 30); }
    const invert = med < 110; // фон тёмный — текст светлый
    const range = hi - lo || 1;
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      let v = ((gray[j] - lo) * 255) / range;
      if (invert) v = 255 - v;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return { inverted: invert, denoised, noise };
  }

  function resize(canvas, scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * scale));
    c.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c;
  }

  /**
   * Возвращает { view, proc, info }:
   *   view — исходное изображение с учётом поворота (для показа пользователю),
   *   proc — подготовленное изображение, которое отдаётся распознаванию.
   */
  async function prepare(file, { rotation = 0, improve = true } = {}) {
    const img = await decodeImage(file);
    const longSide = Math.max(img.width, img.height);
    const view = drawRotated(img, rotation, Math.min(1, 2400 / longSide));
    const baseScale = Math.min(1, 4500 / longSide);
    let proc = drawRotated(img, rotation, baseScale);
    let info = {};
    if (improve) {
      info = enhance(proc); // шум убираем в исходном разрешении, до увеличения
      let up = 1;
      if (longSide < 1000) up = Math.min(3, 2000 / longSide);
      else if (longSide < 1600) up = 1.5;
      if (up > 1.05) proc = resize(proc, up);
    }
    if (img.close) img.close();
    return { view, proc, info };
  }

  async function recognize(canvas, { langs = ['rus', 'eng'], psm = '3', onProgress } = {}) {
    progressCb = onProgress || null;
    const w = await ensureWorker(langs);
    await w.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    onProgress && onProgress({ status: 'Распознавание текста', progress: 0.3, recognizing: true });
    const res = await w.recognize(canvas, {}, { text: true, blocks: true });
    progressCb = null;
    return res.data;
  }

  async function loadDictionaries() {
    await Promise.all([loadScript('dict/ru.js'), loadScript('dict/en.js')]);
    return window.TS_DICT;
  }

  async function loadPdfTools() {
    await loadScript('vendor/jspdf.umd.min.js');
    await loadScript('vendor/pdf-font.js');
    return { jsPDF: window.jspdf.jsPDF, font: window.TS_PDF_FONT };
  }

  // Прогрев: заранее загружаем движок, пока пользователь выбирает файл
  function warmUp(langs) {
    return ensureWorker(langs).catch((e) => console.warn('warm-up failed', e));
  }

  window.TSOcr = { prepare, recognize, loadDictionaries, loadPdfTools, warmUp, loadScript };
})();
