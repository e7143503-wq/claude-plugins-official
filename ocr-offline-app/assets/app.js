/* ТекстСкан — логика интерфейса */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    dropzone: $('dropzone'), pickBtn: $('pickBtn'), cameraBtn: $('cameraBtn'), fileInput: $('fileInput'), cameraInput: $('cameraInput'),
    viewer: $('viewer'), viewerName: $('viewerName'), viewerStatus: $('viewerStatus'), stage: $('stage'), stageInner: $('stageInner'),
    boxes: $('boxes'), thumbs: $('thumbs'), rotLeftBtn: $('rotLeftBtn'), rotRightBtn: $('rotRightBtn'), boxesBtn: $('boxesBtn'),
    rerunBtn: $('rerunBtn'), removeBtn: $('removeBtn'),
    setLang: $('setLang'), setPsm: $('setPsm'), setImprove: $('setImprove'), setAutocorrect: $('setAutocorrect'),
    setHyphens: $('setHyphens'), setNoise: $('setNoise'), setMerge: $('setMerge'), settingsNote: $('settingsNote'), applySettingsBtn: $('applySettingsBtn'),
    resultMeta: $('resultMeta'), copyBtn: $('copyBtn'), downloadBtn: $('downloadBtn'), downloadMenu: $('downloadMenu'),
    fileName: $('fileName'), formats: $('formats'), markInFile: $('markInFile'),
    progress: $('progress'), progressLabel: $('progressLabel'), progressPct: $('progressPct'), progressBar: $('progressBar'),
    chips: $('chips'), hlToggle: $('hlToggle'), acceptAllBtn: $('acceptAllBtn'),
    editor: $('editor'), emptyState: $('emptyState'), editorHint: $('editorHint'),
    popover: $('popover'), dropOverlay: $('dropOverlay'), toast: $('toast'),
  };

  const KIND_TITLE = {
    fixed: 'Исправлено автоматически',
    guess: 'Дописано по смыслу (предположение)',
    unclear: 'Не удалось разобрать',
    removed: 'Убран мусорный фрагмент',
    user: 'Выбрано вами',
    reverted: 'Оставлен исходный вариант',
  };
  const KIND_EXPLAIN = {
    fixed: 'Слово было распознано с ошибкой — подобрано ближайшее подходящее слово из словаря.',
    guess: 'Слово читалось плохо. Это самый вероятный вариант — проверьте по картинке выше.',
    unclear: 'Подходящего слова не нашлось. Сверьтесь с картинкой и при необходимости впишите слово вручную.',
    removed: 'Точки, чёрточки или пятна, которые движок принял за символы. В текст они не попадают.',
  };

  // ---------- Состояние ----------
  const state = {
    pages: [],
    active: null,
    tokens: new Map(),
    corrector: null,
    correctorPromise: null,
    queueRunning: false,
    dirty: false,
    showBoxes: true,
    popToken: null,
    seq: 0,
  };

  const SETTINGS_KEY = 'tekstskan.settings.v1';
  const defaults = { lang: 'rus+eng', psm: '3', improve: true, autocorrect: true, hyphens: true, noise: true, merge: false, markInFile: true, highlight: true };
  let settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* хранилище недоступно */ }
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  // ---------- Утилиты ----------
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let toastTimer = null;
  function toast(msg, isErr) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('err', !!isErr);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), isErr ? 5000 : 2200);
  }
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  const langsFromSetting = () => settings.lang.split('+');
  const confColor = (c) => (c >= 80 ? 'var(--fixed-line)' : c >= 55 ? 'var(--guess-line)' : 'var(--unclear-line)');

  function getCorrector() {
    if (state.corrector) return Promise.resolve(state.corrector);
    if (!state.correctorPromise) {
      state.correctorPromise = window.TSOcr.loadDictionaries().then((d) => {
        state.corrector = new window.TSCorrector({ ru: d.ru, en: d.en });
        return state.corrector;
      }).catch((e) => { state.correctorPromise = null; throw e; });
    }
    return state.correctorPromise;
  }

  // ---------- Настройки ----------
  function applySettingsToUI() {
    el.setLang.value = settings.lang;
    el.setPsm.value = settings.psm;
    el.setImprove.checked = settings.improve;
    el.setAutocorrect.checked = settings.autocorrect;
    el.setHyphens.checked = settings.hyphens;
    el.setNoise.checked = settings.noise;
    el.setMerge.checked = settings.merge;
    el.markInFile.checked = settings.markInFile;
    el.hlToggle.checked = settings.highlight;
    el.editor.classList.toggle('no-hl', !settings.highlight);
  }
  // Эти настройки требуют повторного распознавания
  for (const [node, key] of [[el.setLang, 'lang'], [el.setPsm, 'psm'], [el.setImprove, 'improve']]) {
    node.addEventListener('change', () => {
      settings[key] = node.type === 'checkbox' ? node.checked : node.value;
      saveSettings();
      if (key === 'lang') window.TSOcr.warmUp(langsFromSetting());
      if (state.pages.some((p) => p.status === 'done' || p.status === 'error')) el.settingsNote.hidden = false;
    });
  }
  // Эти — только пересобирают текст из уже распознанных данных
  for (const [node, key] of [[el.setAutocorrect, 'autocorrect'], [el.setHyphens, 'hyphens'], [el.setNoise, 'noise'], [el.setMerge, 'merge']]) {
    node.addEventListener('change', async () => {
      if (state.dirty && !confirm('Текст будет собран заново, ваши ручные правки пропадут. Продолжить?')) {
        node.checked = settings[key];
        return;
      }
      settings[key] = node.checked;
      saveSettings();
      for (const p of state.pages) if (p.ocr) await buildPage(p);
      renderAllText();
    });
  }
  el.applySettingsBtn.addEventListener('click', () => rerunAll());
  el.markInFile.addEventListener('change', () => { settings.markInFile = el.markInFile.checked; saveSettings(); });
  el.hlToggle.addEventListener('change', () => {
    settings.highlight = el.hlToggle.checked;
    saveSettings();
    el.editor.classList.toggle('no-hl', !settings.highlight);
    el.boxes.classList.toggle('off', !settings.highlight || !state.showBoxes);
  });

  // ---------- Добавление изображений ----------
  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f && (f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|bmp|gif|tiff?)$/i.test(f.name || '')));
    if (!files.length) { toast('Это не изображение. Выберите фото, скриншот или скан.', true); return; }
    const added = [];
    for (const file of files) {
      const id = 'p' + (++state.seq);
      const name = file.name && file.name !== 'image.png' ? file.name : `Изображение ${state.seq}`;
      const page = { id, name, file, url: URL.createObjectURL(file), rotation: 0, status: 'queued', ocr: null, model: null, view: null, proc: null };
      state.pages.push(page);
      added.push(page);
    }
    if (state.pages.length === added.length) {
      const base = (added[0].name || 'текст').replace(/\.[^.]+$/, '').trim();
      el.fileName.value = base || 'текст';
    }
    el.settingsNote.hidden = true;
    setActive(added[0].id);
    renderThumbs();
    updateLayout();
    processQueue();
  }

  el.pickBtn.addEventListener('click', (e) => { e.stopPropagation(); el.fileInput.click(); });
  el.cameraBtn.addEventListener('click', (e) => { e.stopPropagation(); el.cameraInput.click(); });
  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); } });
  el.fileInput.addEventListener('change', () => { addFiles(el.fileInput.files); el.fileInput.value = ''; });
  el.cameraInput.addEventListener('change', () => { addFiles(el.cameraInput.files); el.cameraInput.value = ''; });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) el.cameraBtn.hidden = false;

  // Перетаскивание
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; el.dropOverlay.hidden = false; });
  window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) el.dropOverlay.hidden = true; });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; el.dropOverlay.hidden = true;
    addFiles(e.dataTransfer.files);
  });

  // Вставка из буфера обмена
  document.addEventListener('paste', (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const images = items.filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
    if (images.length) {
      e.preventDefault();
      addFiles(images);
      return;
    }
    if (e.target === el.editor || el.editor.contains(e.target)) {
      // в редактор вставляем только простой текст
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  });

  // ---------- Очередь распознавания ----------
  async function processQueue() {
    if (state.queueRunning) return;
    state.queueRunning = true;
    try {
      let page;
      while ((page = state.pages.find((p) => p.status === 'queued'))) {
        await processPage(page);
      }
    } finally {
      state.queueRunning = false;
      setProgress(null);
      el.stageInner.classList.remove('scanning');
    }
  }

  async function processPage(page) {
    const total = state.pages.length;
    const index = state.pages.indexOf(page) + 1;
    const prefix = total > 1 ? `Изображение ${index} из ${total}: ` : '';
    page.status = 'processing';
    renderThumbs();
    updateViewerStatus();
    try {
      setProgress({ status: prefix + 'Подготовка изображения', progress: 0.02 });
      const prepared = await window.TSOcr.prepare(page.file, { rotation: page.rotation, improve: settings.improve });
      if (!state.pages.includes(page)) return;
      page.view = prepared.view;
      page.proc = prepared.proc;
      if (state.active === page.id) showPageImage(page);
      el.stageInner.classList.toggle('scanning', state.active === page.id);
      const dictReady = getCorrector();
      const run = (psm, label) => window.TSOcr.recognize(prepared.proc, {
        langs: langsFromSetting(),
        psm,
        onProgress: (p) => setProgress({ status: prefix + (label || p.status), progress: p.progress }),
      });
      let data = await run(settings.psm);
      if (!state.pages.includes(page)) return;
      // В автоматическом режиме слабый результат пробуем улучшить другой разметкой страницы
      if (settings.psm === '3') {
        const corrector = await dictReady.catch(() => null);
        let best = { data, q: quality(data, corrector) };
        if (best.q.words === 0 || best.q.avg < 62) {
          for (const alt of ['6', '11']) {
            const d2 = await run(alt, 'Пробую другой способ разметки текста');
            const q2 = quality(d2, corrector);
            if (q2.score > best.q.score * 1.1) best = { data: d2, q: q2 };
          }
          data = best.data;
        }
      }
      if (!state.pages.includes(page)) return;
      page.ocr = { blocks: data.blocks || [], confidence: data.confidence, text: data.text };
      setProgress({ status: prefix + 'Проверка и дописывание слов', progress: 0.98 });
      await dictReady.catch(() => null);
      await buildPage(page);
      page.status = 'done';
      renderPageText(page);
      if (!state.scrolledToResult && window.matchMedia && matchMedia('(max-width: 980px)').matches) {
        state.scrolledToResult = true;
        document.querySelector('.panel-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error(err);
      page.status = 'error';
      page.error = (err && err.message) || String(err);
      toast('Ошибка распознавания: ' + page.error, true);
    }
    el.stageInner.classList.remove('scanning');
    renderThumbs();
    updateViewerStatus();
    if (state.active === page.id) renderBoxes();
  }

  // Оценка качества распознавания: уверенность × доля настоящих (словарных) слов
  function quality(data, corrector) {
    let score = 0, words = 0, confSum = 0;
    for (const b of data.blocks || []) for (const pa of b.paragraphs) for (const l of pa.lines) for (const w of l.words) {
      const core = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!core) continue;
      words++;
      confSum += w.confidence;
      const lang = /[а-яё]/i.test(core) ? 'ru' : 'en';
      const known = corrector ? corrector.known(core, lang) : true;
      score += (w.confidence / 100) * (known ? 1 : 0.35) * Math.min(core.length, 12);
    }
    return { score, words, avg: words ? confSum / words : 0 };
  }

  async function buildPage(page) {
    let corrector = null;
    try { corrector = await getCorrector(); } catch (e) { console.warn('Словари не загружены', e); }
    const opts = { autocorrect: settings.autocorrect && !!corrector, joinHyphens: settings.hyphens, removeNoise: settings.noise, mergeLines: settings.merge };
    // удаляем старые токены страницы
    for (const id of Array.from(state.tokens.keys())) if (id.startsWith(page.id + '-')) state.tokens.delete(id);
    const engine = corrector || new window.TSCorrector({});
    page.model = engine.processPage(page.ocr.blocks, opts, page.id);
    for (const para of page.model.paragraphs) for (const line of para.lines) for (const t of line.toks) {
      t.pageId = page.id;
      if (t.origCore === undefined) t.origCore = t.core;
      state.tokens.set(t.id, t);
    }
  }

  function rerunAll() {
    if (state.dirty && !confirm('Текст будет распознан заново, ваши ручные правки пропадут. Продолжить?')) return;
    for (const p of state.pages) p.status = 'queued';
    el.settingsNote.hidden = true;
    renderThumbs();
    processQueue();
  }

  // ---------- Прогресс ----------
  function setProgress(p) {
    if (!p) { el.progress.hidden = true; return; }
    el.progress.hidden = false;
    const pct = Math.max(0, Math.min(100, Math.round((p.progress || 0) * 100)));
    el.progressLabel.textContent = p.status + '…';
    el.progressPct.textContent = pct + '%';
    el.progressBar.style.width = pct + '%';
  }

  // ---------- Просмотр изображения ----------
  function setActive(id) {
    state.active = id;
    const page = state.pages.find((p) => p.id === id);
    if (!page) return;
    showPageImage(page);
    renderThumbs();
    updateViewerStatus();
  }

  function showPageImage(page) {
    el.viewerName.textContent = page.name;
    for (const n of Array.from(el.stageInner.children)) if (n !== el.boxes) n.remove();
    let node;
    if (page.view) {
      node = page.view;
    } else {
      node = new Image();
      node.src = page.url;
      node.alt = page.name;
      node.style.transform = page.rotation ? `rotate(${page.rotation}deg)` : '';
    }
    el.stageInner.insertBefore(node, el.boxes);
    el.stageInner.classList.toggle('scanning', page.status === 'processing');
    renderBoxes();
  }

  function updateViewerStatus() {
    const page = state.pages.find((p) => p.id === state.active);
    if (!page) return;
    const map = { queued: 'в очереди', processing: 'распознаётся…', done: 'готово', error: 'ошибка' };
    el.viewerStatus.textContent = map[page.status] || '';
    el.viewerStatus.className = 'status-pill ' + page.status;
    el.viewerStatus.title = page.status === 'error' ? page.error || '' : '';
  }

  function renderThumbs() {
    el.thumbs.innerHTML = '';
    for (const p of state.pages) {
      const b = document.createElement('button');
      b.className = 'thumb' + (p.id === state.active ? ' active' : '');
      b.title = p.name;
      b.innerHTML = `<img alt="" src="${p.url}" style="${p.rotation ? `transform:rotate(${p.rotation}deg)` : ''}"><span class="st ${p.status}"></span>`;
      b.addEventListener('click', () => setActive(p.id));
      el.thumbs.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'thumb add';
    add.title = 'Добавить изображения';
    add.setAttribute('aria-label', 'Добавить изображения');
    add.textContent = '+';
    add.addEventListener('click', () => el.fileInput.click());
    el.thumbs.appendChild(add);
  }

  function renderBoxes() {
    el.boxes.innerHTML = '';
    el.boxes.classList.toggle('off', !settings.highlight || !state.showBoxes);
    const page = state.pages.find((p) => p.id === state.active);
    if (!page || !page.proc || !page.model) return;
    const W = page.proc.width, H = page.proc.height;
    const marks = el.editor.querySelectorAll(`mark.w[data-id^="${page.id}-"]`);
    for (const m of marks) {
      const t = state.tokens.get(m.dataset.id);
      if (!t) continue;
      for (const bb of [t.bbox, t.bbox2].filter(Boolean)) {
        const d = document.createElement('div');
        d.className = 'wbox ' + m.dataset.kind;
        d.dataset.id = t.id;
        d.style.left = (bb.x0 / W) * 100 + '%';
        d.style.top = (bb.y0 / H) * 100 + '%';
        d.style.width = ((bb.x1 - bb.x0) / W) * 100 + '%';
        d.style.height = ((bb.y1 - bb.y0) / H) * 100 + '%';
        d.title = `${m.textContent || '(удалено)'} — ${KIND_TITLE[m.dataset.kind] || ''}`;
        d.addEventListener('click', () => {
          const mark = el.editor.querySelector(`mark.w[data-id="${t.id}"]`);
          if (mark) { mark.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => openPopover(mark), 250); }
        });
        d.addEventListener('mouseenter', () => hot(t.id, true));
        d.addEventListener('mouseleave', () => hot(t.id, false));
        el.boxes.appendChild(d);
      }
    }
  }

  function hot(id, on) {
    for (const n of document.querySelectorAll(`[data-id="${id}"]`)) n.classList.toggle('hot', on);
  }

  el.boxesBtn.addEventListener('click', () => {
    state.showBoxes = !state.showBoxes;
    el.boxesBtn.setAttribute('aria-pressed', String(state.showBoxes));
    el.boxes.classList.toggle('off', !settings.highlight || !state.showBoxes);
  });
  function rotateActive(delta) {
    const page = state.pages.find((p) => p.id === state.active);
    if (!page || page.status === 'processing') return;
    page.rotation = (page.rotation + delta + 360) % 360;
    page.view = null; page.proc = null; page.status = 'queued';
    showPageImage(page);
    renderThumbs();
    processQueue();
  }
  el.rotLeftBtn.addEventListener('click', () => rotateActive(-90));
  el.rotRightBtn.addEventListener('click', () => rotateActive(90));
  el.rerunBtn.addEventListener('click', () => {
    const page = state.pages.find((p) => p.id === state.active);
    if (!page || page.status === 'processing') return;
    page.status = 'queued';
    renderThumbs();
    processQueue();
  });
  el.removeBtn.addEventListener('click', () => {
    const i = state.pages.findIndex((p) => p.id === state.active);
    if (i < 0) return;
    const page = state.pages[i];
    if (page.status === 'processing') { toast('Подождите, изображение ещё распознаётся'); return; }
    state.pages.splice(i, 1);
    URL.revokeObjectURL(page.url);
    const node = el.editor.querySelector(`p.page[data-page="${page.id}"]`);
    if (node) node.remove();
    for (const id of Array.from(state.tokens.keys())) if (id.startsWith(page.id + '-')) state.tokens.delete(id);
    closePopover();
    if (state.pages.length) setActive(state.pages[Math.min(i, state.pages.length - 1)].id);
    else state.active = null;
    renderThumbs();
    updateLayout();
    updateStats();
  });

  // ---------- Текст ----------
  function markHtml(t) {
    const kind = t.kind;
    if (kind === 'removed') return `<mark class="w w-removed" data-id="${t.id}" data-kind="removed" contenteditable="false" title="${escapeHtml('Убрано: ' + t.raw)}"></mark>`;
    const core = escapeHtml(t.text);
    if (!kind) return core;
    return `<mark class="w w-${kind}" data-id="${t.id}" data-kind="${kind}">${core}</mark>`;
  }

  function pageHtml(page) {
    let html = '';
    let prevBlock = null;
    for (const para of page.model.paragraphs) {
      const lines = [];
      for (const line of para.lines) {
        let s = '';
        let needSpace = false;
        for (const t of line.toks) {
          if (t.kind === 'removed') { s += markHtml(t); continue; }
          if (needSpace) s += ' ';
          s += escapeHtml(t.pre) + markHtml(t) + escapeHtml(t.post);
          needSpace = true;
        }
        if (s) lines.push(s);
      }
      if (!lines.length) continue;
      // абзацы одного блока — с новой строки, разные блоки — через пустую строку
      if (prevBlock !== null) html += para.block === prevBlock && !settings.merge ? '\n' : '\n\n';
      html += lines.join(settings.merge ? ' ' : '\n');
      prevBlock = para.block;
    }
    return html;
  }

  function renderPageText(page) {
    if (!page.model) return;
    let node = el.editor.querySelector(`p.page[data-page="${page.id}"]`);
    if (!node) {
      node = document.createElement('p');
      node.className = 'page';
      node.dataset.page = page.id;
      // сохраняем порядок изображений
      const idx = state.pages.indexOf(page);
      const next = state.pages.slice(idx + 1).map((p) => el.editor.querySelector(`p.page[data-page="${p.id}"]`)).find(Boolean);
      el.editor.insertBefore(node, next || null);
    }
    node.dataset.label = page.name;
    node.innerHTML = pageHtml(page) || '';
    if (!node.textContent.trim() && !node.querySelector('mark')) node.textContent = '';
    if (!page.model.stats.words) toast(`На «${page.name}» текст не найден. Попробуйте повернуть изображение или выбрать другой тип в настройках.`, true);
    afterTextChange();
  }

  function renderAllText() {
    el.editor.innerHTML = '';
    for (const p of state.pages) if (p.model) renderPageText(p);
    state.dirty = false;
    afterTextChange();
  }

  function afterTextChange() {
    updateLayout();
    updateStats();
    renderBoxes();
  }

  function updateLayout() {
    const hasPages = state.pages.length > 0;
    el.viewer.hidden = !hasPages;
    el.dropzone.classList.toggle('compact', hasPages);
    const hasText = !!el.editor.textContent.trim() || !!el.editor.querySelector('mark');
    el.emptyState.hidden = hasText;
    el.editorHint.hidden = !hasText;
    el.copyBtn.disabled = !hasText;
    el.downloadBtn.disabled = !hasText;
    el.editor.classList.toggle('multi', el.editor.querySelectorAll('p.page').length > 1);
  }

  function updateStats() {
    const counts = { fixed: 0, guess: 0, unclear: 0, removed: 0 };
    for (const m of el.editor.querySelectorAll('mark.w')) if (counts[m.dataset.kind] !== undefined) counts[m.dataset.kind]++;
    for (const c of el.chips.querySelectorAll('.chip')) {
      const n = counts[c.dataset.kind] || 0;
      c.querySelector('b').textContent = n;
      c.classList.toggle('zero', n === 0);
    }
    const anyMarks = el.editor.querySelector('mark.w');
    el.chips.hidden = !anyMarks && !state.pages.some((p) => p.model);
    const text = TextModel.plain();
    const words = (text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
    const done = state.pages.filter((p) => p.model);
    if (!done.length) { el.resultMeta.textContent = 'Здесь появится текст с изображения'; return; }
    const conf = Math.round(done.reduce((s, p) => s + (p.model.stats.avgConf || 0), 0) / done.length);
    el.resultMeta.textContent = `${words} ${plural(words, 'слово', 'слова', 'слов')} · ${text.length} ${plural(text.length, 'символ', 'символа', 'символов')}` +
      (done.length > 1 ? ` · ${done.length} ${plural(done.length, 'изображение', 'изображения', 'изображений')}` : '') +
      ` · средняя уверенность ${conf}%`;
  }

  // Редактор
  el.editor.addEventListener('input', () => {
    state.dirty = true;
    updateLayout();
    clearTimeout(el.editor._t);
    el.editor._t = setTimeout(() => { updateStats(); renderBoxes(); }, 300);
  });
  el.editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
    if (e.key === 'Escape') closePopover();
  });
  el.editor.addEventListener('click', (e) => {
    const m = e.target.closest && e.target.closest('mark.w');
    if (m && el.editor.contains(m)) openPopover(m);
    else closePopover();
  });
  el.editor.addEventListener('mouseover', (e) => {
    const m = e.target.closest && e.target.closest('mark.w');
    if (m) hot(m.dataset.id, true);
  });
  el.editor.addEventListener('mouseout', (e) => {
    const m = e.target.closest && e.target.closest('mark.w');
    if (m) hot(m.dataset.id, false);
  });

  // ---------- Модель текста для копирования и экспорта ----------
  const TextModel = {
    lines() {
      const lines = [[]];
      const cur = () => lines[lines.length - 1];
      const newline = () => lines.push([]);
      const push = (text, extra) => {
        const parts = text.split('\n');
        parts.forEach((p, i) => {
          if (i > 0) newline();
          if (p) cur().push(Object.assign({ text: p }, extra || {}));
        });
      };
      const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/;
      let firstPage = true;
      const walk = (node) => {
        for (const ch of node.childNodes) {
          if (ch.nodeType === 3) { push(ch.nodeValue); continue; }
          if (ch.nodeType !== 1) continue;
          const tag = ch.tagName;
          if (tag === 'BR') { newline(); continue; }
          if (tag === 'MARK' && ch.classList.contains('w')) {
            const kind = ch.dataset.kind;
            if (kind === 'removed') continue;
            const t = state.tokens.get(ch.dataset.id);
            push(ch.textContent, kind ? { kind, orig: t ? t.origCore : undefined, conf: t ? t.conf : undefined, alts: t ? t.alts : undefined } : null);
            continue;
          }
          if (BLOCK.test(tag)) {
            if (cur().length) newline();
            if (ch.classList.contains('page')) {
              if (!firstPage) { if (cur().length) newline(); if (lines.length > 1 && lines[lines.length - 2].length) newline(); }
              firstPage = false;
            }
            walk(ch);
            if (cur().length) newline();
            continue;
          }
          walk(ch);
        }
      };
      walk(el.editor);
      // убираем пустые строки в начале и конце, схлопываем длинные пробелы
      while (lines.length && !lines[0].length) lines.shift();
      while (lines.length && !lines[lines.length - 1].length) lines.pop();
      const out = [];
      let blank = 0;
      for (const l of lines) {
        const empty = !l.map((r) => r.text).join('').trim();
        blank = empty ? blank + 1 : 0;
        if (blank <= 1) out.push({ runs: empty ? [] : l });
      }
      return out;
    },
    plain() {
      return this.lines().map((l) => l.runs.map((r) => r.text).join('').replace(/\s+$/, '')).join('\n');
    },
    doc() {
      const title = (el.fileName.value || 'Распознанный текст').trim();
      return {
        title,
        lines: this.lines(),
        pages: state.pages.filter((p) => p.model).map((p) => ({
          name: p.name,
          averageConfidence: p.model.stats.avgConf,
          words: p.model.paragraphs.flatMap((pa) => pa.lines.flatMap((l) => l.toks.map((t) => ({
            recognized: t.raw, text: t.kind === 'removed' ? '' : t.pre + t.text + t.post, confidence: t.conf, status: t.kind || 'ok', bbox: t.bbox,
          })))),
        })),
      };
    },
  };

  // ---------- Копирование ----------
  async function copyText() {
    const text = TextModel.plain();
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    if (ok) {
      toast('Текст скопирован в буфер обмена');
      const label = el.copyBtn.querySelector('span');
      label.textContent = 'Скопировано ✓';
      setTimeout(() => { label.textContent = 'Копировать'; }, 1600);
    } else {
      toast('Не удалось скопировать автоматически — выделите текст и нажмите Ctrl+C', true);
    }
  }
  el.copyBtn.addEventListener('click', copyText);

  // ---------- Скачивание ----------
  function buildFormats() {
    for (const [key, f] of Object.entries(window.TSExport.FORMATS)) {
      const b = document.createElement('button');
      b.className = 'fmt';
      b.dataset.f = key;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span class="ext">${f.label}</span><span class="name">${f.desc}</span>`;
      b.title = `Скачать как .${f.ext}`;
      b.addEventListener('click', () => downloadAs(key));
      el.formats.appendChild(b);
    }
  }
  async function downloadAs(format) {
    const f = window.TSExport.FORMATS[format];
    const doc = TextModel.doc();
    if (!doc.lines.length) return;
    try {
      const blob = await window.TSExport.make(format, doc, el.markInFile.checked && !!f.marks);
      const name = (el.fileName.value || 'текст').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'текст';
      window.TSExport.download(blob, `${name}.${f.ext}`);
      toast(`Файл ${name}.${f.ext} сохранён`);
      toggleMenu(false);
    } catch (e) {
      console.error(e);
      toast('Не удалось создать файл: ' + (e.message || e), true);
    }
  }
  function toggleMenu(open) {
    const willOpen = open === undefined ? el.downloadMenu.hidden : open;
    el.downloadMenu.hidden = !willOpen;
    el.downloadBtn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) closePopover();
  }
  el.downloadBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => {
    if (!el.downloadMenu.hidden && !el.downloadMenu.contains(e.target) && e.target !== el.downloadBtn) toggleMenu(false);
    if (!el.popover.hidden && !el.popover.contains(e.target) && !(e.target.closest && e.target.closest('mark.w, .wbox, .chip'))) closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { toggleMenu(false); closePopover(); }
  });

  // ---------- Карточка слова ----------
  // Фрагмент изображения вокруг слова: с соседними словами и рамкой вокруг нужного
  function cropCanvas(page, bbox) {
    if (!page || !page.view || !page.proc || !bbox) return null;
    const r = page.view.width / page.proc.width;
    const bx = bbox.x0 * r, by = bbox.y0 * r, bw = (bbox.x1 - bbox.x0) * r, bh = (bbox.y1 - bbox.y0) * r;
    if (bw < 1 || bh < 1) return null;
    const padY = Math.max(4, bh * 0.45);
    const padX = Math.max(padY, bh * 2.2, bw * 0.35);
    const x = Math.max(0, bx - padX), y = Math.max(0, by - padY);
    const w = Math.min(page.view.width - x, bw + padX * 2);
    const h = Math.min(page.view.height - y, bh + padY * 2);
    const scale = Math.min(300 / w, 78 / h, 5);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(page.view, x, y, w, h, 0, 0, c.width, c.height);
    // приглушаем соседей и обводим само слово
    const rx = (bx - x) * scale - 3, ry = (by - y) * scale - 3, rw = bw * scale + 6, rh = bh * scale + 6;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, c.width, c.height);
    ctx.rect(rx, ry, rw, rh);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
    return c;
  }

  function openPopover(mark) {
    const t = state.tokens.get(mark.dataset.id);
    if (!t) return;
    toggleMenu(false);
    state.popToken = t.id;
    const kind = mark.dataset.kind;
    const page = state.pages.find((p) => p.id === t.pageId);
    const now = mark.textContent;
    const orig = kind === 'removed' ? t.raw : t.origCore;
    const alts = Array.from(new Set([...(kind !== 'removed' && orig && orig !== now ? [orig] : []), ...(t.alts || []), ...(t.text !== now ? [t.text] : [])]))
      .filter((a) => a && a !== now).slice(0, 6);
    const p = el.popover;
    p.innerHTML = `
      <div class="pop-head"><span class="pop-kind ${kind}">${KIND_TITLE[kind] || 'Слово'}</span>
        <button class="icon-btn pop-close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="pop-crop"></div>
      <div class="pop-caption">так это выглядит на изображении</div>
      <dl class="pop-rows">
        <dt>Распознано</dt><dd><span class="orig">${escapeHtml(t.raw)}</span></dd>
        <dt>Уверенность</dt><dd>${t.conf}%<span class="conf"><i style="width:${t.conf}%;background:${confColor(t.conf)}"></i></span></dd>
        ${kind !== 'removed' ? `<dt>В тексте</dt><dd class="now">${escapeHtml(now)}</dd>` : ''}
      </dl>
      ${KIND_EXPLAIN[kind] || t.note ? `<p class="pop-note">${escapeHtml(t.note ? capital(t.note) + '. ' : '')}${escapeHtml(KIND_EXPLAIN[kind] || '')}</p>` : ''}
      ${kind !== 'removed' && alts.length ? `<div class="pop-alts"><span>Другие варианты — нажмите, чтобы подставить:</span>${alts.map((a) => `<button class="alt" data-alt="${escapeHtml(a)}">${escapeHtml(a)}${a === orig ? ' <small>(как распознано)</small>' : ''}</button>`).join('')}</div>` : ''}
      ${kind !== 'removed' ? `<form class="pop-edit"><input type="text" value="${escapeHtml(now)}" aria-label="Своё слово" spellcheck="true"><button class="btn" type="submit">Заменить</button></form>` : ''}
      <div class="pop-actions">
        ${kind === 'removed'
          ? `<button class="btn" data-act="restore">Вернуть «${escapeHtml(t.raw)}»</button><button class="btn btn-primary" data-act="accept">OK, убрать</button>`
          : `<button class="btn btn-primary" data-act="accept">✓ Верно</button>${orig && orig !== now ? `<button class="btn" data-act="revert" title="${escapeHtml('Вернуть «' + orig + '»')}">↺ Как было</button>` : ''}`}
      </div>`;
    const crop = p.querySelector('.pop-crop');
    const boxes = [t.bbox, t.bbox2].filter(Boolean);
    let any = false;
    for (const b of boxes) { const c = cropCanvas(page, b); if (c) { crop.appendChild(c); any = true; } }
    if (!any) { crop.remove(); p.querySelector('.pop-caption').remove(); }

    p.querySelector('.pop-close').addEventListener('click', closePopover);
    for (const b of p.querySelectorAll('.alt')) b.addEventListener('click', () => setMarkText(mark, b.dataset.alt, b.dataset.alt === orig ? 'reverted' : 'user'));
    const form = p.querySelector('.pop-edit');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); const v = form.querySelector('input').value.trim(); if (v) setMarkText(mark, v, v === orig ? 'reverted' : 'user'); });
    for (const b of p.querySelectorAll('[data-act]')) {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'accept') acceptMark(mark);
        else if (act === 'revert') setMarkText(mark, orig, 'reverted');
        else if (act === 'restore') restoreRemoved(mark, t);
      });
    }
    p.hidden = false;
    positionPopover(mark);
    document.querySelectorAll('mark.w.hot, .wbox.hot').forEach((n) => n.classList.remove('hot'));
    hot(t.id, true);
  }
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function positionPopover(mark) {
    const p = el.popover;
    if (p.hidden) return;
    const r = (mark.getClientRects()[0]) || mark.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), vw - pw - 12);
    let top = r.bottom + 10;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 10);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  function closePopover() {
    if (el.popover.hidden) return;
    el.popover.hidden = true;
    if (state.popToken) hot(state.popToken, false);
    state.popToken = null;
  }
  window.addEventListener('resize', () => {
    const m = state.popToken && el.editor.querySelector(`mark.w[data-id="${state.popToken}"]`);
    if (m) positionPopover(m);
  });
  el.editor.addEventListener('scroll', () => closePopover(), { passive: true });
  window.addEventListener('scroll', () => {
    const m = state.popToken && el.editor.querySelector(`mark.w[data-id="${state.popToken}"]`);
    if (m) positionPopover(m);
  }, { passive: true });

  function setMarkText(mark, text, kind) {
    mark.textContent = text;
    mark.dataset.kind = kind;
    mark.className = 'w w-' + kind;
    state.dirty = true;
    closePopover();
    afterTextChange();
  }
  function acceptMark(mark) {
    closePopover();
    hot(mark.dataset.id, false);
    if (mark.dataset.kind === 'removed') mark.remove();
    else mark.replaceWith(document.createTextNode(mark.textContent));
    state.dirty = true;
    afterTextChange();
  }
  function restoreRemoved(mark, t) {
    const node = document.createElement('mark');
    node.className = 'w w-reverted';
    node.dataset.id = t.id;
    node.dataset.kind = 'reverted';
    node.textContent = t.raw;
    mark.replaceWith(document.createTextNode(' '), node, document.createTextNode(' '));
    t.origCore = t.raw;
    state.dirty = true;
    closePopover();
    afterTextChange();
  }

  // Чипы: переход к следующему слову нужного типа
  const chipCursor = {};
  for (const c of el.chips.querySelectorAll('.chip')) {
    c.addEventListener('click', () => {
      const kind = c.dataset.kind;
      const list = Array.from(el.editor.querySelectorAll(`mark.w[data-kind="${kind}"]`));
      if (!list.length) return;
      chipCursor[kind] = ((chipCursor[kind] === undefined ? -1 : chipCursor[kind]) + 1) % list.length;
      const m = list[chipCursor[kind]];
      const page = state.pages.find((p) => m.dataset.id.startsWith(p.id + '-'));
      if (page && page.id !== state.active) setActive(page.id);
      m.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => openPopover(m), 280);
    });
  }
  el.acceptAllBtn.addEventListener('click', () => {
    const marks = Array.from(el.editor.querySelectorAll('mark.w'));
    if (!marks.length) return;
    for (const m of marks) {
      if (m.dataset.kind === 'removed') m.remove();
      else m.replaceWith(document.createTextNode(m.textContent));
    }
    el.editor.normalize();
    state.dirty = true;
    closePopover();
    afterTextChange();
    toast('Все исправления приняты');
  });

  // ---------- Старт ----------
  applySettingsToUI();
  buildFormats();
  renderThumbs();
  updateLayout();
  // заранее подгружаем движок и словари, чтобы первое распознавание было быстрым
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  idle(() => { window.TSOcr.warmUp(langsFromSetting()); getCorrector().catch(() => {}); });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // для автотестов и отладки
  window.TSApp = { state, TextModel, addFiles, copyText, downloadAs };
})();
