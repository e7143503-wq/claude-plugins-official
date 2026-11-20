/*
 * ТекстСкан — модуль «логического» дописывания слов.
 *
 * Работает полностью офлайн. Для каждого распознанного слова:
 *   1. исправляет «двойников» — латинские буквы и цифры внутри русских слов (pабота → работа, 0чень → очень);
 *   2. если слова нет в словаре и распознавание неуверенное, ищет ближайшие словарные слова
 *      с учётом типичных ошибок распознавания (и↔н, ш↔щ, rn↔m, е↔с …) и частоты слова в языке;
 *   3. склеивает переносы (распозна- / вание) и слова, разорванные пробелом;
 *   4. помечает мусорные символы и слова, которые не удалось уверенно разобрать.
 * Каждое изменение сохраняется вместе с исходным вариантом, чтобы показать его пользователю.
 */
(function (root) {
  'use strict';

  // ---------- Словари ----------
  function parseDict(raw) {
    const map = new Map();
    const byLen = new Map();
    for (const line of raw.split('\n')) {
      const bar = line.indexOf('|');
      if (bar < 0) continue;
      const zipf = Number(line.slice(0, bar)) / 10;
      for (const w of line.slice(bar + 1).split(' ')) {
        if (!w || map.has(w)) continue;
        map.set(w, zipf);
        const len = w.length;
        if (!byLen.has(len)) byLen.set(len, { words: [], zipf: [] });
        const b = byLen.get(len);
        b.words.push(w);
        b.zipf.push(zipf);
      }
    }
    return { map, byLen, size: map.size };
  }

  // ---------- Символы и их «похожесть» ----------
  const CYR = /[а-яё]/i;
  const LAT = /[a-z]/i;
  const LETTER = /[a-zа-яё]/i;
  const JUNK_EDGE = new Set(Array.from('‘’\'`|_~^*"«»„“”·•°¦/\\'));
  const JUNK_IN_WORD = new Set(Array.from('‘’\'`|_~^*",.;:·•°¦!'));

  // Латиница/цифры, похожие на кириллицу (внутри русских слов)
  const TO_CYR = {
    a: 'а', b: 'ь', c: 'с', e: 'е', k: 'к', m: 'м', n: 'п', o: 'о', p: 'р', r: 'г', u: 'и', x: 'х', y: 'у',
    A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
    '0': 'о', '3': 'з', '6': 'б', '4': 'ч',
  };
  // Кириллица/цифры, похожие на латиницу (внутри английских слов)
  const TO_LAT = {
    'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'к': 'k', 'і': 'i', 'ј': 'j', 'ѕ': 's',
    'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X',
    '0': 'o', '1': 'l', '5': 's', '|': 'l',
  };

  // Стоимость замены похожих букв (чем меньше — тем вероятнее ошибка распознавания)
  const SUB = new Map();
  function sim(cost, groups) {
    for (const g of groups) {
      const chars = Array.from(g);
      for (const a of chars) for (const b of chars) if (a !== b) {
        const k = a + b;
        if (!SUB.has(k) || SUB.get(k) > cost) SUB.set(k, cost);
      }
    }
  }
  sim(0.0, ['её']);
  sim(0.25, ['ий', 'шщ', 'ьъ', 'ilI1|', 'o0', 'il']);
  sim(0.35, ['ин', 'нп', 'пл', 'ец', 'цщ', 'зэ', 'вб', 'тг', 'ес', 'оа', 'ьы', 'rn', 'ce', 'oa', 'ec', 'uv', 'vy', 'hb', 'nh', 'ft', 'cо']);
  sim(0.5, ['инплцй', 'шщцш', 'есоэз', 'аод', 'бвьъы6', 'тгр', 'кхж', 'уч', 'млт', 'юо', 'ая', 'фр', 'жк',
    'ocea', 'unr', 'mn', 'ij', 'lt', 'gq', 'bh', 'kx', 'wv', 'yv', 'fl', 'tf', 'ao']);
  sim(0.7, ['йн', 'ий', 'дл', 'аэ', 'ыи', 'зв', 'бь', 'eo', 'sz', 'gy']);
  // Одна буква читается как две и наоборот
  const SPLIT = new Map([
    ['m', ['rn', 'nn', 'ni']], ['w', ['vv', 'vu']], ['d', ['cl']], ['h', ['li']], ['k', ['lc', 'lk']],
    ['ы', ['ьі', 'ьl', 'ь1', 'bl', 'ъі', 'ьi']], ['ю', ['іо', 'io', 'lo']], ['м', ['пл', 'лл']], ['ш', ['ии', 'шı']],
    ['щ', ['ш,']], ['н', ['и:']], ['т', ['гг']],
  ]);
  const SPLIT_COST = 0.4;
  const INS_COST = 0.9;   // в распознанном слове пропущена буква
  const DEL_COST = 0.9;   // в распознанном слове лишняя буква
  const DEL_JUNK = 0.25;  // лишний «мусорный» символ внутри слова

  // Быстрая таблица стоимостей замен по кодам символов
  const MAXCODE = 0x500;
  function del(chCode) { return JUNK_IN_WORD.has(String.fromCharCode(chCode)) ? DEL_JUNK : DEL_COST; }
  const SUB_BY_CODE = new Map(); // code -> Map(code -> cost)
  for (const [k, v] of SUB) {
    const a = k.codePointAt(0), b = k.codePointAt(1);
    if (!SUB_BY_CODE.has(a)) SUB_BY_CODE.set(a, new Map());
    SUB_BY_CODE.get(a).set(b, v);
  }
  const HAS_SPLIT = new Uint8Array(MAXCODE);
  for (const ch of SPLIT.keys()) { const c = ch.charCodeAt(0); if (c < MAXCODE) HAS_SPLIT[c] = 1; }
  function subCost(a, b) {
    if (a === b) return 0;
    const m = SUB_BY_CODE.get(a.charCodeAt(0));
    const c = m && m.get(b.charCodeAt(0));
    return c === undefined ? 1 : c;
  }

  /*
   * Поиск похожих слов. Словарь отсортирован, поэтому строки таблицы
   * динамического программирования для общего префикса считаются один раз,
   * а целые ветки слов отбрасываются, как только цена превышает предел.
   */
  function sortedIndex(d) {
    if (d.sorted) return d.sorted;
    const words = Array.from(d.map.keys()).sort();
    const zipf = new Float32Array(words.length);
    const lcp = new Uint8Array(words.length);
    for (let k = 0; k < words.length; k++) {
      zipf[k] = d.map.get(words[k]);
      if (k) {
        const a = words[k - 1], b = words[k];
        const L = Math.min(a.length, b.length, 255);
        let l = 0;
        while (l < L && a.charCodeAt(l) === b.charCodeAt(l)) l++;
        lcp[k] = l;
      }
    }
    d.sorted = { words, zipf, lcp };
    return d.sorted;
  }

  function search(sorted, obs, maxCost, minLen, maxLen, onFound) {
    const n = obs.length;
    const oc = new Int32Array(n);
    const odel = new Float32Array(n);
    const osub = [];
    for (let i = 0; i < n; i++) {
      oc[i] = obs.charCodeAt(i);
      odel[i] = del(oc[i]);
      osub.push(SUB_BY_CODE.get(oc[i]) || null);
    }
    const rows = [];
    for (let d = 0; d <= maxLen; d++) rows.push(new Float32Array(n + 1));
    rows[0][0] = 0;
    for (let i = 1; i <= n; i++) rows[0][i] = rows[0][i - 1] + odel[i - 1];
    const { words, zipf, lcp } = sorted;
    const N = words.length;
    let valid = 0;
    let k = 0;
    while (k < N) {
      const w = words[k];
      let d = k ? Math.min(valid, lcp[k]) : 0;
      const L = Math.min(w.length, maxLen);
      let pruned = 0;
      while (d < L) {
        d++;
        const row = rows[d], prev = rows[d - 1], prev2 = d >= 2 ? rows[d - 2] : null;
        const c = w.charCodeAt(d - 1);
        const c2 = d >= 2 ? w.charCodeAt(d - 2) : 0;
        const cSplit = c < MAXCODE && HAS_SPLIT[c] ? SPLIT.get(String.fromCharCode(c)) : null;
        row[0] = prev[0] + INS_COST;
        let rmin = row[0];
        for (let i = 1; i <= n; i++) {
          const o = oc[i - 1];
          let sc = 1;
          if (o === c) sc = 0; else { const m = osub[i - 1]; if (m) { const t = m.get(c); if (t !== undefined) sc = t; } }
          let v = prev[i - 1] + sc;
          const dl = row[i - 1] + odel[i - 1]; if (dl < v) v = dl;
          const ins = prev[i] + INS_COST; if (ins < v) v = ins;
          if (cSplit && i >= 2 && cSplit.includes(obs[i - 2] + obs[i - 1])) {
            const s = prev[i - 2] + SPLIT_COST; if (s < v) v = s;
          }
          if (prev2 && o < MAXCODE && HAS_SPLIT[o]) {
            const pairs = SPLIT.get(obs[i - 1]);
            if (pairs.includes(String.fromCharCode(c2, c))) { const s = prev2[i - 1] + SPLIT_COST; if (s < v) v = s; }
          }
          row[i] = v;
          if (v < rmin) rmin = v;
        }
        if (rmin > maxCost) { pruned = d; break; }
      }
      valid = d;
      if (pruned) {
        k++;
        while (k < N && lcp[k] >= pruned) k++;
        continue;
      }
      if (w.length > maxLen) {
        k++;
        while (k < N && lcp[k] >= maxLen) k++;
        continue;
      }
      if (w.length >= minLen) {
        const cost = rows[w.length][n];
        if (cost <= maxCost) onFound(w, zipf[k], cost);
      }
      k++;
    }
  }

  function distance(obs, cand, maxCost) {
    let out = Infinity;
    search({ words: [cand], zipf: [0], lcp: new Uint8Array(1) }, obs, maxCost, 0, cand.length, (w, z, c) => { out = c; });
    return out;
  }

  // ---------- Вспомогательное ----------
  const K_COST = 3.2;   // насколько «дорого» менять буквы
  const K_FREQ = 2.3;   // насколько ценится частотность слова (ln 10)

  function casePattern(w) {
    const letters = Array.from(w).filter((ch) => LETTER.test(ch));
    if (!letters.length) return 'lower';
    const up = letters.filter((ch) => ch !== ch.toLowerCase()).length;
    if (up === letters.length && letters.length > 1) return 'upper';
    if (letters[0] !== letters[0].toLowerCase()) return 'title';
    return 'lower';
  }
  function applyCase(w, pattern) {
    if (pattern === 'upper') return w.toUpperCase();
    if (pattern === 'title') return w.charAt(0).toUpperCase() + w.slice(1);
    return w;
  }
  function scriptOf(w) {
    let c = 0, l = 0;
    for (const ch of w) { if (CYR.test(ch)) c++; else if (LAT.test(ch)) l++; }
    if (!c && !l) return null;
    return c >= l ? 'ru' : 'en';
  }
  function maxCostFor(len, conf) {
    let base = len <= 2 ? 0.9 : len === 3 ? 1.0 : len === 4 ? 1.3 : len <= 6 ? 1.8 : len <= 8 ? 2.4 : len <= 11 ? 3.0 : 3.5;
    if (conf >= 85) base *= 0.6; else if (conf >= 65) base *= 0.85; else if (conf < 35) base *= 1.15;
    return base;
  }
  const isNumberLike = (s) => /^[\d.,:;/\\+\-–—%№#()$€₽°]+$/.test(s) && /\d/.test(s);
  const isUrlLike = (s) => /@|:\/\/|^www\.|\.(ru|com|org|net|рф)\b/i.test(s);

  // ---------- Корректор ----------
  function Corrector(dicts) {
    this.dicts = {};
    for (const lang of Object.keys(dicts || {})) {
      if (dicts[lang]) this.dicts[lang] = parseDict(dicts[lang]);
    }
    this.cache = new Map();
  }

  Corrector.prototype.zipf = function (word, lang) {
    const d = this.dicts[lang];
    if (!d) return null;
    const key = word.toLowerCase().replace(/ё/g, 'е');
    if (d.map.has(key)) return d.map.get(key);
    // составные через дефис: «какой-то», «научно-технический»
    if (key.includes('-')) {
      const parts = key.split('-').filter(Boolean);
      if (parts.length > 1 && parts.every((p) => d.map.has(p) || p === 'то' || p === 'либо' || p === 'нибудь' || p === 'таки')) {
        return Math.min(...parts.map((p) => d.map.get(p) || 3));
      }
    }
    return null;
  };

  // Есть ли в словаре слова, начинающиеся с prefix (двоичный поиск по отсортированному словарю)
  Corrector.prototype.hasPrefix = function (prefix, lang, except) {
    const d = this.dicts[lang];
    if (!d) return false;
    const { words } = sortedIndex(d);
    let lo = 0, hi = words.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid] < prefix) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < words.length && i < lo + 4; i++) {
      if (!words[i].startsWith(prefix)) return false;
      if (words[i] !== except) return true;
    }
    return false;
  };

  const ENDINGS = {
    ru: ['иями', 'ями', 'ами', 'иях', 'ться', 'лись', 'лась', 'лось', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'тся', 'ешь', 'ишь',
      'ете', 'ите', 'ях', 'ах', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ую', 'юю', 'ов', 'ев', 'ей', 'ам', 'ям', 'ом', 'ем',
      'ия', 'ии', 'ию', 'ье', 'ья', 'ьи', 'ют', 'ят', 'ут', 'ат', 'ет', 'ит', 'ла', 'ли', 'ло', 'ть', 'ся', 'сь', 'ны', 'на', 'но',
      'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й', 'н', 'м', 'х'],
    en: ['ing', 'ed', 'es', 'est', 'er', 'ly', 's', 'y', 'e'],
  };
  /** Похоже ли неизвестное слово на редкую форму словарного слова («дописаны» ← «дописать») */
  Corrector.prototype.plausibleForm = function (word, lang) {
    const w = word.toLowerCase().replace(/ё/g, 'е');
    const list = ENDINGS[lang] || [];
    for (const e of list) {
      if (!w.endsWith(e)) continue;
      const stem = w.slice(0, w.length - e.length);
      if (stem.length < 4 || stem.length < w.length * 0.6) continue;
      if (this.hasPrefix(stem, lang, w)) return true;
    }
    return false;
  };

  Corrector.prototype.known = function (word, lang) {
    return this.zipf(word, lang) !== null;
  };

  /** Список вариантов для слова (в нижнем регистре), лучшие — первыми. */
  Corrector.prototype.candidates = function (word, lang, conf, extra) {
    const d = this.dicts[lang];
    if (!d) return [];
    const obs = word.toLowerCase().replace(/ё/g, 'е');
    const maxCost = maxCostFor(obs.length, conf);
    const key = lang + '|' + obs + '|' + maxCost.toFixed(2);
    if (this.cache.has(key)) return this.cache.get(key);
    const found = new Map();
    const span = Math.max(1, Math.floor(maxCost / 0.85));
    search(sortedIndex(d), obs, maxCost, Math.max(1, obs.length - span), Math.min(60, obs.length + span), (w, z, cost) => {
      found.set(w, { word: w, cost, zipf: z, score: -K_COST * cost + K_FREQ * z });
    });
    // варианты, которые предложил сам движок распознавания
    for (const alt of extra || []) {
      const a = alt.toLowerCase().replace(/ё/g, 'е');
      const z = d.map.get(a);
      if (z !== undefined && !found.has(a)) {
        const cost = Math.min(distance(obs, a, 10), maxCost);
        found.set(a, { word: a, cost, zipf: z, score: -K_COST * cost + K_FREQ * z + 1 });
      }
    }
    const list = Array.from(found.values()).sort((x, y) => y.score - x.score).slice(0, 8);
    this.cache.set(key, list);
    return list;
  };

  /**
   * Анализ одного слова. Возвращает { text, kind, alts, note }
   * kind: null (без изменений) | 'fixed' (уверенно исправлено) | 'guess' (вероятное исправление) | 'unclear' (не разобрано)
   */
  Corrector.prototype.checkWord = function (core, conf, ctxLang, choices, sentenceStart, foreign) {
    const original = core;
    if (!core || !LETTER.test(core) || isUrlLike(core)) return { text: core, kind: null };
    const pattern = casePattern(core);

    // 1. «Двойники»: латиница или цифры внутри русского слова (и наоборот)
    const hasDigit = /\d/.test(core);
    const lettersOnly = core.replace(/[^a-zа-яё]/gi, '');
    let script = scriptOf(core) || ctxLang;
    if (script === 'en' && ctxLang === 'ru' && lettersOnly.length > 1) {
      const asCyr = Array.from(core).map((ch) => TO_CYR[ch] || ch).join('');
      if (!/[a-z]/i.test(asCyr) && this.known(asCyr, 'ru')) {
        return { text: asCyr, kind: 'fixed', alts: [], note: 'латинские буквы заменены на русские' };
      }
    }
    const mixed = CYR.test(core) && LAT.test(core);
    if (mixed || (hasDigit && lettersOnly.length >= 2)) {
      const table = script === 'ru' ? TO_CYR : TO_LAT;
      const fixed = Array.from(core).map((ch) => table[ch] || ch).join('');
      if (fixed !== core && (script === 'ru' ? !/[a-z]/i.test(fixed) : !CYR.test(fixed))) {
        if (this.known(fixed, script)) {
          return { text: fixed, kind: 'fixed', alts: [], note: script === 'ru' ? 'похожие латинские буквы и цифры заменены на русские' : 'похожие символы заменены на латинские' };
        }
        core = fixed; // продолжаем исправление уже нормализованного слова
      } else if (hasDigit && !mixed) {
        return { text: core, kind: null }; // смесь цифр и букв (номер, артикул) — не трогаем
      }
    }
    if (/\d/.test(core)) return { text: core, kind: null };

    const lang = scriptOf(core) || ctxLang;
    if (!this.dicts[lang]) return { text: core, kind: null };
    const lower = core.toLowerCase();
    const zipf = this.zipf(lower, lang);
    const len = Array.from(lettersOnly).length;
    const changedByNormalization = core !== original;

    // Аббревиатуры (ООО, ИНН, USB) и имена собственные с хорошей уверенностью не трогаем
    if (zipf === null && pattern === 'upper' && len <= 5 && conf >= 60) return { text: core, kind: null };

    if (zipf !== null) {
      // Слово есть в словаре. Сомневаемся, только если оно редкое и распознано плохо.
      const suspicious = (zipf < 2.6 && conf < 75) || (zipf < 3.5 && conf < 40);
      if (!suspicious) {
        if (changedByNormalization) return { text: core, kind: 'fixed', alts: [] };
        // слово другого алфавита среди соседей (например, русское слово посреди английской фразы) или очень низкая уверенность
        if ((foreign && conf < 60) || conf < 30) return { text: core, kind: 'unclear', alts: [], note: foreign ? 'слово другого алфавита среди соседних слов' : 'очень низкая уверенность распознавания' };
        return { text: core, kind: null };
      }
      const cands = this.candidates(lower, lang, conf, choices).filter((c) => c.word !== lower.replace(/ё/g, 'е'));
      const own = K_FREQ * zipf;
      const best = cands[0];
      if (best && best.score > own + 3 && best.cost <= 1.0) {
        return { text: applyCase(best.word, pattern), kind: 'guess', alts: [lower, ...cands.slice(1, 4).map((c) => c.word)].map((w) => applyCase(w, pattern)) };
      }
      if (changedByNormalization) return { text: core, kind: 'fixed', alts: [] };
      if ((foreign && conf < 60) || conf < 30) return { text: core, kind: 'unclear', alts: cands.slice(0, 3).map((c) => applyCase(c.word, pattern)), note: foreign ? 'слово другого алфавита среди соседних слов' : 'очень низкая уверенность распознавания' };
      return { text: core, kind: null };
    }

    // Слова нет в словаре
    if (conf >= 92 && len > 3) return { text: core, kind: null }; // уверенно распознано — вероятно, имя или термин
    if (pattern === 'title' && conf >= 70 && len > 3 && !sentenceStart) return { text: core, kind: null }; // имя собственное
    const keep = () => (changedByNormalization ? { text: core, kind: 'fixed', alts: [] } : { text: core, kind: null });
    const plausible = len >= 5 && this.plausibleForm(lower, lang);
    if (plausible && conf >= 55) {
      // похоже на редкую форму словарного слова — меняем только явную «опечатку распознавания»
      const near = this.candidates(lower, lang, conf, choices).filter((c) => c.cost <= 0.4 && c.zipf >= 3.5);
      if (!near.length) return keep();
      return { text: applyCase(near[0].word, pattern), kind: 'fixed', alts: [lower, ...near.slice(1, 3).map((c) => c.word)].map((w) => applyCase(w, pattern)) };
    }
    if (conf >= 65) {
      // распознано неплохо — допускаем только небольшие правки (зависит от длины слова)
      const nearMax = len <= 4 ? 0.35 : len <= 6 ? 0.6 : len <= 10 ? 1.0 : 1.4;
      const all = this.candidates(lower, lang, conf, choices);
      const near = all.filter((c) => c.cost <= nearMax && c.zipf >= 2.0);
      if (!near.length) {
        if (len <= 2 && all.length) return { text: core, kind: 'unclear', alts: all.slice(0, 4).map((c) => applyCase(c.word, pattern)), note: 'такого короткого слова нет в словаре' };
        return keep();
      }
      const rival = all.find((c) => c !== near[0]);
      if (rival && near[0].score - rival.score < 1.0 && near[0].cost > 0.35) {
        return { text: core, kind: 'unclear', alts: [near[0], rival].map((c) => applyCase(c.word, pattern)) };
      }
      return { text: applyCase(near[0].word, pattern), kind: 'fixed', alts: all.filter((c) => c !== near[0]).slice(0, 4).map((c) => applyCase(c.word, pattern)) };
    }
    const cands = this.candidates(lower, lang, conf, choices);
    if (!cands.length) {
      return { text: core, kind: conf < 70 || len <= 2 ? 'unclear' : null, alts: [] };
    }
    const best = cands[0];
    const second = cands[1];
    const margin = second ? best.score - second.score : 99;
    // слово похоже на редкую форму — заменяем, только если вариант заметно убедительнее
    if (plausible && !(best.score > K_FREQ * 2.2 + 2 && best.cost <= 1.0)) {
      return { text: core, kind: conf < 40 ? 'unclear' : null, alts: cands.slice(0, 4).map((c) => applyCase(c.word, pattern)) };
    }
    // Очень короткие неизвестные «слова» исправляем только при явном перевесе
    if (len <= 2 && !(margin > 1.5 && conf < 70)) {
      return { text: core, kind: conf < 60 ? 'unclear' : null, alts: cands.slice(0, 4).map((c) => applyCase(c.word, pattern)) };
    }
    const confident = best.cost <= 0.5 || (margin >= 1.6 && best.cost <= maxCostFor(len, conf) * 0.75);
    return {
      text: applyCase(best.word, pattern),
      kind: confident ? 'fixed' : 'guess',
      alts: cands.slice(1, 5).map((c) => applyCase(c.word, pattern)),
    };
  };

  // ---------- Обработка страницы ----------
  function splitToken(text) {
    const chars = Array.from(text);
    let s = 0, e = chars.length;
    while (s < e && !LETTER.test(chars[s]) && !/\d/.test(chars[s])) s++;
    while (e > s && !LETTER.test(chars[e - 1]) && !/\d/.test(chars[e - 1])) e--;
    return { pre: chars.slice(0, s).join(''), core: chars.slice(s, e).join(''), post: chars.slice(e).join('') };
  }

  function lineLang(words) {
    let c = 0, l = 0;
    for (const w of words) for (const ch of w.text) { if (CYR.test(ch)) c++; else if (LAT.test(ch)) l++; }
    return l > c ? 'en' : 'ru';
  }

  /**
   * Превращает результат tesseract (data.blocks) в абзацы токенов с пометками.
   * options: { autocorrect, joinHyphens, removeNoise, mergeLines, langs: ['ru','en'] }
   */
  Corrector.prototype.processPage = function (blocks, options, idPrefix) {
    const opt = Object.assign({ autocorrect: true, joinHyphens: true, removeNoise: true, mergeLines: false }, options);
    const paragraphs = [];
    let seq = 0;
    const stats = { words: 0, fixed: 0, guess: 0, unclear: 0, removed: 0, confSum: 0 };

    let blockIndex = 0;
    for (const block of blocks || []) {
      blockIndex++;
      for (const para of block.paragraphs || []) {
        const lines = [];
        for (const line of para.lines || []) {
          const ctxLang = lineLang(line.words || []);
          const toks = [];
          for (const w of line.words || []) {
            const raw = (w.text || '').trim();
            if (!raw) continue;
            const { pre, core, post } = splitToken(raw);
            toks.push({
              id: `${idPrefix}-${seq++}`, raw, pre, core, post, text: core, kind: null, origCore: core,
              conf: Math.round(w.confidence), bbox: w.bbox, lang: ctxLang,
              choices: (w.choices || []).map((c) => c.text).filter((t) => t && t !== raw),
            });
          }
          if (toks.length) lines.push({ toks, lang: ctxLang });
        }
        if (lines.length) paragraphs.push({ lines, block: blockIndex });
      }
    }

    for (const para of paragraphs) {
      // мусор: отдельные знаки/буквы с очень низкой уверенностью
      if (opt.removeNoise) {
        for (const line of para.lines) {
          for (const t of line.toks) {
            const letters = t.raw.replace(/[^a-zа-яё0-9]/gi, '');
            const validSingle = /^[авиксуяоАВИКСУЯОaiAI]$/.test(letters) || /^\d+$/.test(letters);
            const noise = (t.conf < 30 && (!letters.length || (letters.length <= 2 && !validSingle))) ||
              (t.conf < 15 && letters.length <= 3 && !this.known(letters, line.lang));
            if (noise && !/^[—–-]$/.test(t.raw)) {
              t.kind = 'removed'; t.text = ''; t.pre = ''; t.post = ''; t.note = 'удалён мусорный фрагмент';
            }
          }
        }
      }
      // лишние «хвосты» вроде ‘ ` | у неуверенных слов
      for (const line of para.lines) {
        for (const t of line.toks) {
          if (t.kind === 'removed' || t.conf >= 60) continue;
          const junkPre = Array.from(t.pre).every((ch) => JUNK_EDGE.has(ch)) && t.pre && !/[«"„“(]/.test(t.pre);
          if (junkPre && t.core) { t.pre = ''; t.edgeFixed = true; }
          const postClean = t.post.replace(/[‘’`|_~^*¦]+/g, '');
          if (postClean !== t.post && t.core) { t.post = postClean; t.edgeFixed = true; }
        }
      }
      // перенос со строки на строку: «распозна-» + «вание»
      if (opt.joinHyphens) {
        for (let i = 0; i < para.lines.length - 1; i++) {
          const a = para.lines[i].toks, b = para.lines[i + 1].toks;
          const last = a[a.length - 1], first = b[0];
          if (!last || !first || last.kind === 'removed') continue;
          const realHyphen = /^[-‐‑–¬]$/.test(last.post);
          const looksHyphen = /^[-‐‑–¬:.~_=,;]{1,3}$/.test(last.post) && last.conf < 85;
          if ((realHyphen || looksHyphen) && last.core && first.core && /^[a-zа-яё]/.test(first.core)) {
            const joined = last.core + first.core;
            const lang = scriptOf(joined) || para.lines[i].lang;
            const ok = realHyphen
              ? this.known(joined, lang) || !this.known(last.core, lang) || !this.known(first.core, lang)
              : (this.zipf(joined, lang) || 0) >= 2;
            if (ok) {
              last.origCore = `${last.core}${last.post} ${first.core}`;
              last.raw = `${last.raw} ${first.raw}`; last.core = joined; last.text = joined; last.post = first.post;
              last.conf = Math.min(last.conf, first.conf); last.hyphenJoined = true;
              last.bbox2 = first.bbox;
              b.shift();
            }
          }
        }
      }
      // слово, разорванное пробелом: «распо знавание»
      if (opt.autocorrect) {
        for (const line of para.lines) {
          for (let i = 0; i < line.toks.length - 1; i++) {
            const a = line.toks[i], b = line.toks[i + 1];
            if (a.kind || b.kind || a.post || b.pre || !a.core || !b.core) continue;
            const lang = scriptOf(a.core + b.core) || line.lang;
            if (scriptOf(a.core) !== scriptOf(b.core)) continue;
            const ka = this.known(a.core, lang), kb2 = this.known(b.core, lang);
            if (ka && kb2) continue;
            const joined = a.core + b.core;
            const z = this.zipf(joined, lang);
            if (z !== null && z >= 2.5) {
              a.origCore = `${a.core} ${b.core}`;
              a.raw = `${a.raw} ${b.raw}`; a.core = joined; a.text = joined; a.post = b.post;
              a.conf = Math.min(a.conf, b.conf); a.kind = 'fixed'; a.note = 'слово было разорвано пробелом';
              a.bbox = { x0: Math.min(a.bbox.x0, b.bbox.x0), y0: Math.min(a.bbox.y0, b.bbox.y0), x1: Math.max(a.bbox.x1, b.bbox.x1), y1: Math.max(a.bbox.y1, b.bbox.y1) };
              a.alts = [];
              line.toks.splice(i + 1, 1);
            }
          }
        }
      }
      // основная проверка слов
      let sentenceStart = true;
      for (const line of para.lines) {
        for (const t of line.toks) {
          if (t.kind === 'removed') { stats.removed++; continue; }
          const startsSentence = sentenceStart || /[«"„“(—–-]/.test(t.pre);
          sentenceStart = /[.!?…:]$/.test(t.post) || (!t.core && /[.!?…]/.test(t.pre));
          stats.words++; stats.confSum += t.conf;
          if (t.kind) { if (t.kind === 'fixed') stats.fixed++; continue; }
          if (!opt.autocorrect) continue;
          const idx = line.toks.indexOf(t);
          const neigh = [line.toks[idx - 1], line.toks[idx + 1]].filter((x) => x && x.kind !== 'removed' && x.core && LETTER.test(x.core)).map((x) => scriptOf(x.core));
          const own = scriptOf(t.core);
          const foreign = neigh.length > 0 && own && neigh.every((sc) => sc && sc !== own);
          const r = this.checkWord(t.core, t.conf, line.lang, t.choices, startsSentence, foreign);
          t.text = r.text;
          t.alts = (r.alts || []).filter((x) => x && x !== r.text);
          if (r.note) t.note = r.note;
          if (r.kind) t.kind = r.kind;
          else if (t.hyphenJoined || t.edgeFixed) t.kind = 'fixed';
          if (t.hyphenJoined && !t.note) t.note = 'перенос слова объединён';
          if (t.edgeFixed && !t.note) t.note = 'убраны лишние символы';
          if (t.kind === 'fixed') stats.fixed++;
          else if (t.kind === 'guess') stats.guess++;
          else if (t.kind === 'unclear') stats.unclear++;
        }
      }
    }
    stats.avgConf = stats.words ? Math.round(stats.confSum / stats.words) : 0;
    delete stats.confSum;
    return { paragraphs, stats };
  };

  Corrector.parseDict = parseDict;
  Corrector.distance = distance;
  if (typeof module === 'object' && module.exports) module.exports = Corrector;
  else root.TSCorrector = Corrector;
})(typeof window !== 'undefined' ? window : globalThis);
