/*
 * Бюро проектов: каталог, карточка проекта, корзина и заявка.
 * Без зависимостей. Проекты берутся из js/projects.js, настройки из js/config.js.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  if (!root.lang) root.lang = 'ru';

  /* ====================================================================
     Помощники
     ==================================================================== */

  const str = (v) => (v == null ? '' : String(v));
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => str(v).replace(/[&<>"']/g, (ch) => ESC[ch]);
  const norm = (v) => str(v).toLowerCase().replace(/ё/g, 'е');
  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  /* Пропускает обычные ссылки и относительные пути, отсекает javascript: и подобное. */
  function safeUrl(value, allowDataImage) {
    const url = str(value).trim();
    if (!url) return '';
    const probe = url.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
    if (/^(https?:|mailto:|tel:)/.test(probe)) return url;
    if (allowDataImage && /^data:image\//.test(probe)) return url;
    if (/^[a-z][a-z0-9+.-]*:/.test(probe)) return '';
    return url;
  }

  /* plural(3, ['проект', 'проекта', 'проектов']) → 'проекта' */
  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  const PROJECT_FORMS = ['проект', 'проекта', 'проектов'];

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Генератор случайных чисел с зерном: у одного проекта обложка всегда одинаковая. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
  };

  function slugify(text) {
    return str(text)
      .toLowerCase()
      .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] || '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* хранилище недоступно: работаем без него */ }
    }
  };

  /* ====================================================================
     Настройки
     ==================================================================== */

  const rawCfg = window.SHOP_CONFIG || {};
  const rawContacts = rawCfg.contacts || {};
  const rawLegal = rawCfg.legal || {};
  const rawBrand = rawCfg.brand || {};
  const rawEmail = str(rawContacts.email).trim();
  const rawEndpoint = str(rawCfg.orderEndpoint).trim();

  const CFG = {
    brand: {
      name: str(rawBrand.name).trim() || 'Бюро проектов',
      tagline: str(rawBrand.tagline).trim() || 'Готовые проекты с исходниками'
    },
    demo: !!rawCfg.demo,
    currency: str(rawCfg.currency).trim().toUpperCase() || 'RUB',
    locale: str(rawCfg.locale).trim() || 'ru-RU',
    contacts: {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '',
      telegram: str(rawContacts.telegram).trim().replace(/^https?:\/\/t\.me\//i, '').replace(/[^A-Za-z0-9_]/g, ''),
      whatsapp: str(rawContacts.whatsapp).replace(/\D/g, ''),
      phone: str(rawContacts.phone).trim()
    },
    orderEndpoint: /^(https?:\/\/|\/)/i.test(rawEndpoint) ? rawEndpoint : '',
    legal: {
      privacyUrl: safeUrl(rawLegal.privacyUrl),
      offerUrl: safeUrl(rawLegal.offerUrl)
    }
  };

  /* ====================================================================
     Деньги и даты
     ==================================================================== */

  function makeMoneyFormat(digits) {
    try {
      return new Intl.NumberFormat(CFG.locale, {
        style: 'currency',
        currency: CFG.currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
    } catch (e) {
      return null;
    }
  }

  const moneyWhole = makeMoneyFormat(0);
  const moneyCents = makeMoneyFormat(2);

  function money(value) {
    const format = Number.isInteger(value) ? moneyWhole : moneyCents;
    return format ? format.format(value) : value + ' ' + CFG.currency;
  }

  function priceText(p) {
    if (p.price == null) return 'По запросу';
    if (p.price === 0) return 'Бесплатно';
    return money(p.price);
  }

  function priceHtml(p) {
    const ask = p.price == null;
    return `<span class="price${ask ? ' price--ask' : ''}">${esc(priceText(p))}</span>` +
      (p.oldPrice ? ` <s class="price-old"><span class="sr-only">Старая цена: </span>${esc(money(p.oldPrice))}</s>` : '');
  }

  function dateText(ts) {
    try {
      return new Date(ts).toLocaleDateString(CFG.locale, { timeZone: 'UTC' });
    } catch (e) {
      return new Date(ts).toISOString().slice(0, 10);
    }
  }

  /* ====================================================================
     Проекты
     ==================================================================== */

  function toList(value) {
    return Array.isArray(value) ? value.map((x) => str(x).trim()).filter(Boolean) : [];
  }

  function toPrice(value) {
    let v = value;
    if (typeof v === 'string' && v.trim() !== '') v = Number(v.replace(/\s/g, '').replace(',', '.'));
    return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null;
  }

  function normalizeProjects(raw) {
    const used = new Set();
    const out = [];
    (Array.isArray(raw) ? raw : []).forEach((src, index) => {
      if (!src || typeof src !== 'object') return;
      const title = str(src.title).trim();
      if (!title) {
        console.warn(`[shop] Проект №${index + 1} пропущен: не заполнено поле title.`);
        return;
      }
      let id = str(src.id).trim();
      if (!/^[A-Za-z0-9_-]+$/.test(id)) id = slugify(id || title) || 'project';
      let unique = id;
      let k = 2;
      while (used.has(unique)) unique = id + '-' + k++;
      if (unique !== id) console.warn(`[shop] id «${id}» повторяется. Проект «${title}» получил id «${unique}».`);
      used.add(unique);

      const price = toPrice(src.price);
      const oldPrice = toPrice(src.oldPrice);
      const specs = src.specs && typeof src.specs === 'object'
        ? Object.keys(src.specs).map((key) => [str(key).trim(), str(src.specs[key]).trim()]).filter((row) => row[0] && row[1])
        : [];
      const added = Date.parse(str(src.added));
      const p = {
        id: unique,
        title,
        category: str(src.category).trim() || 'Разное',
        price,
        oldPrice: price != null && oldPrice != null && oldPrice > price ? oldPrice : null,
        badge: str(src.badge).trim(),
        addedTs: isNaN(added) ? 0 : added,
        summary: str(src.summary).trim(),
        description: str(src.description).trim(),
        features: toList(src.features),
        includes: toList(src.includes),
        stack: toList(src.stack),
        specs,
        demoUrl: safeUrl(src.demoUrl),
        buyUrl: safeUrl(src.buyUrl),
        image: safeUrl(src.image, true),
        gallery: toList(src.gallery).map((u) => safeUrl(u, true)).filter(Boolean),
        cover: str(src.cover).trim(),
        sold: !!src.sold
      };
      p.hay = norm([p.title, p.category, p.summary, p.description, p.stack.join(' '), p.features.join(' ')].join(' '));
      out.push(p);
    });
    return out;
  }

  const projects = normalizeProjects(window.SHOP_PROJECTS);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const categories = [];
  projects.forEach((p) => {
    let c = categories.find((x) => x.name === p.category);
    if (!c) categories.push((c = { name: p.category, count: 0 }));
    c.count++;
  });

  /* ====================================================================
     Обложки: чертёж рисуется из названия и категории проекта
     ==================================================================== */

  const n1 = (x) => Math.round(x * 10) / 10;
  const cls = (c) => (c ? ` class="${c}"` : '');
  const ln = (x1, y1, x2, y2, c) => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}"${cls(c)}/>`;
  const rc = (x, y, w, h, c, rx) => `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}"${rx ? ` rx="${rx}"` : ''}${cls(c)}/>`;
  const ci = (x, y, r, c) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}"${cls(c)}/>`;
  const pa = (d, c) => `<path d="${d}"${cls(c)}/>`;
  const pl = (pts, c) => `<polyline points="${pts.map((p) => n1(p[0]) + ',' + n1(p[1])).join(' ')}"${cls(c)}/>`;
  const xbox = (x, y, w, h) => rc(x, y, w, h) + ln(x, y, x + w, y + h, 't') + ln(x + w, y, x, y + h, 't');

  function textLines(x, y, w, count, gap, rnd, c) {
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = i === count - 1 ? 0.35 + rnd() * 0.3 : 0.72 + rnd() * 0.28;
      out += ln(x, y + i * gap, x + w * part, y + i * gap, c || 't');
    }
    return out;
  }

  /* Размерные линии со стрелками, как на чертеже. */
  function dimH(x1, x2, y) {
    return ln(x1, y - 5, x1, y + 5, 't') + ln(x2, y - 5, x2, y + 5, 't') + ln(x1, y, x2, y, 't') +
      pa(`M${n1(x1)},${y} l8,-2.8 v5.6 z`, 'k') + pa(`M${n1(x2)},${y} l-8,-2.8 v5.6 z`, 'k');
  }

  function dimV(x, y1, y2) {
    return ln(x - 5, y1, x + 5, y1, 't') + ln(x - 5, y2, x + 5, y2, 't') + ln(x, y1, x, y2, 't') +
      pa(`M${x},${n1(y1)} l-2.8,8 h5.6 z`, 'k') + pa(`M${x},${n1(y2)} l-2.8,-8 h5.6 z`, 'k');
  }

  function arrow(x1, y1, x2, y2, c) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const tip = (da) => `${n1(x2 - 8 * Math.cos(a + da))},${n1(y2 - 8 * Math.sin(a + da))}`;
    return ln(x1, y1, x2, y2, c) + pa(`M${n1(x2)},${n1(y2)} L${tip(0.38)} L${tip(-0.38)} z`, 'k');
  }

  /* Дуга от верхней точки окружности по часовой стрелке на угол a (в радианах). */
  function arcFromTop(cx, cy, rad, a, c) {
    return pa(`M${cx},${cy - rad} A${rad},${rad} 0 ${a > Math.PI ? 1 : 0} 1 ${n1(cx + rad * Math.sin(a))},${n1(cy - rad * Math.cos(a))}`, c);
  }

  /* Вид обложки получает генератор случайных чисел r (зерно из id проекта)
     и номер раскладки v. Раскладки раздаются так, чтобы проекты с одним видом
     обложки отличались друг от друга: см. assignCoverVariants ниже. */
  const MOTIFS = {
    browser(r, v) {
      const x = 70, y = 28, w = 260, h = 170;
      let o = rc(x, y, w, h, 'o') + ln(x, y + 22, x + w, y + 22) +
        ci(x + 13, y + 11, 3) + ci(x + 25, y + 11, 3) + ci(x + 37, y + 11, 3) + rc(x + 58, y + 6, 130, 10, 't');
      if (v === 0) {
        o += xbox(x + 14, y + 34, w - 28, 54);
        const cols = 3 + Math.floor(r() * 2), gap = 10, cw = (w - 28 - gap * (cols - 1)) / cols;
        for (let i = 0; i < cols; i++) {
          const cx = x + 14 + i * (cw + gap);
          o += rc(cx, y + 100, cw, 34, i === 1 ? 's' : '') + textLines(cx, y + 144, cw, 2, 8, r);
        }
      } else if (v === 1) {
        o += rc(x + 14, y + 34, 56, h - 48);
        for (let i = 0; i < 5; i++) o += ln(x + 24, y + 50 + i * 16, x + 44 + r() * 16, y + 50 + i * 16, 't');
        o += textLines(x + 84, y + 44, 130, 2, 10, r);
        const bw = (w - 84 - 14 - 10) / 2;
        for (let i = 0; i < 4; i++) o += rc(x + 84 + (i % 2) * (bw + 10), y + 72 + Math.floor(i / 2) * 44, bw, 34, i === 0 ? 's' : '');
      } else if (v === 2) {
        o += xbox(x + 14, y + 34, 108, h - 48);
        o += ln(x + 136, y + 46, x + 216, y + 46, 'w') + textLines(x + 136, y + 64, 108, 4, 11, r) + rc(x + 136, y + 118, 66, 20, 's');
      } else {
        o += ln(x + 70, y + 46, x + 190, y + 46, 'w') + ln(x + 92, y + 60, x + 168, y + 60, 't') + rc(x + 98, y + 72, 64, 18, 's');
        for (let i = 0; i < 3; i++) {
          const ry = y + 104 + i * 20;
          o += rc(x + 14, ry, 12, 12, i === 1 ? 's' : '') + ln(x + 34, ry + 6, x + 96 + r() * 40, ry + 6, 't') + rc(x + w - 62, ry, 48, 12, 't');
        }
      }
      return o + dimH(x, x + w, y + h + 24);
    },

    chat(r, v) {
      const heights = v & 1 ? [44, 30, 30, 30] : [30, 30, 44, 30];
      const first = v & 2 ? 1 : 0;
      let o = '';
      let yy = 24;
      for (let i = 0; i < 4; i++) {
        const incoming = (i + first) % 2 === 0;
        const bw = 112 + Math.floor(r() * 64);
        const bh = heights[i];
        const bx = incoming ? 98 : 332 - bw;
        o += rc(bx, yy, bw, bh, incoming ? '' : 's', 8) + textLines(bx + 12, yy + 12, bw - 24, bh > 40 ? 3 : 2, 9, r);
        if (incoming) {
          const ay = yy + bh - 8;
          o += ci(74, ay, 10) + ln(74, ay - 10, 74, ay - 16) + ci(74, ay - 18, 1.8, 'k') + ci(70.5, ay - 1, 1.4, 'k') + ci(77.5, ay - 1, 1.4, 'k');
        }
        yy += bh + 13;
      }
      return o + rc(64, 204, 232, 26, '', 13) + ln(82, 217, 150 + r() * 60, 217, 't') +
        ci(322, 217, 13) + pa('M316,217 h11 M322,212 l5,5 -5,5');
    },

    phone(r, v) {
      const x = 152, y = 16, w = 112, h = 218;
      let o = rc(x - 54, y + 22, 100, 186, 'd', 14);
      o += rc(x, y, w, h, 'o', 16) + ln(x + 42, y + 10, x + 70, y + 10) + ln(x, y + h - 30, x + w, y + h - 30, 't');
      for (let i = 0; i < 4; i++) o += rc(x + 15 + i * 23, y + h - 21, 12, 12, i === 0 ? 's' : 't');
      if (v === 0) {
        for (let i = 0; i < 5; i++) {
          const ry = y + 36 + i * 30;
          o += ci(x + 22, ry, 8, i === 1 ? 's' : '') + ln(x + 38, ry - 4, x + 70 + r() * 28, ry - 4) + ln(x + 38, ry + 5, x + 58 + r() * 20, ry + 5, 't');
        }
      } else if (v === 1) {
        o += xbox(x + 12, y + 24, w - 24, 58);
        for (let i = 0; i < 4; i++) o += rc(x + 12 + (i % 2) * 46, y + 92 + Math.floor(i / 2) * 44, 42, 36, i === 3 ? 's' : '');
      } else {
        const cx = x + w / 2, cy = y + 70;
        o += ci(cx, cy, 30, 't') + arcFromTop(cx, cy, 30, 0.9 + r() * 3.6, 'w') + ln(cx - 10, cy, cx + 10, cy);
        for (let i = 0; i < 3; i++) {
          const ry = y + 122 + i * 22;
          o += rc(x + 14, ry, 12, 12, i === 0 ? 's' : '') + ln(x + 34, ry + 6, x + 62 + r() * 34, ry + 6);
        }
      }
      return o + dimV(x + w + 28, y, y + h);
    },

    dashboard(r, v) {
      const x = 46, y = 30, w = 308, h = 190;
      let o = rc(x, y, w, h, 'o') + ln(x + 56, y, x + 56, y + h);
      for (let i = 0; i < 5; i++) {
        o += rc(x + 12, y + 16 + i * 26, 12, 12, i === 1 ? 's' : '') + ln(x + 30, y + 22 + i * 26, x + 46, y + 22 + i * 26, 't');
      }
      for (let i = 0; i < 3; i++) {
        const tx = x + 70 + i * 78;
        o += rc(tx, y + 14, 68, 38) + ln(tx + 8, y + 26, tx + 34, y + 26, 't') + ln(tx + 8, y + 40, tx + 30 + r() * 24, y + 40, 'w');
      }
      const cx0 = x + 74, cy0 = y + 172, cw = 148, ch = 96, bars = 7, bw = 12, step = cw / bars;
      o += ln(cx0, cy0 - ch, cx0, cy0) + ln(cx0, cy0, cx0 + cw, cy0);
      const peak = Math.floor(r() * bars);
      const asLine = v === 1;
      const pts = [];
      let marks = '';
      for (let i = 0; i < bars; i++) {
        const bh = 20 + r() * 58;
        const bx = cx0 + 6 + i * step;
        if (asLine) {
          pts.push([bx + bw / 2, cy0 - bh]);
          marks += ln(bx + bw / 2, cy0, bx + bw / 2, cy0 - bh, 't') + ci(bx + bw / 2, cy0 - bh, 3, i === peak ? 'k' : 'o');
        } else {
          marks += rc(bx, cy0 - bh, bw, bh, i === peak ? 'k' : 's');
          pts.push([bx + bw / 2, cy0 - bh - 8 - r() * 8]);
        }
      }
      o += asLine ? pl(pts, 'w') + marks : marks + pl(pts, 't');
      const dx = x + 266, dy = y + 114;
      o += ci(dx, dy, 28) + ci(dx, dy, 15) + arcFromTop(dx, dy, 28, 1.2 + r() * 3.2, 'w');
      return o + ln(dx - 26, dy + 44, dx + 26, dy + 44, 't') + ln(dx - 26, dy + 54, dx + 8, dy + 54, 't');
    },

    game(r) {
      const cols = 10, rows = 5, s = 26, ox = 70, oy = 24;
      let o = '';
      for (let i = 0; i <= cols; i++) o += ln(ox + i * s, oy, ox + i * s, oy + rows * s, 't');
      for (let j = 0; j <= rows; j++) o += ln(ox, oy + j * s, ox + cols * s, oy + j * s, 't');
      let row = 1 + Math.floor(r() * 3);
      const pts = [];
      const used = {};
      for (let i = 0; i < cols; i++) {
        const cx = ox + (i + 0.5) * s;
        pts.push([cx, oy + (row + 0.5) * s]);
        used[i + ':' + row] = 1;
        if (i > 0 && i < cols - 1 && r() < 0.5) {
          row = Math.max(0, Math.min(rows - 1, row + (r() < 0.5 ? -1 : 1)));
          pts.push([cx, oy + (row + 0.5) * s]);
          used[i + ':' + row] = 1;
        }
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (!used[i + ':' + j] && r() < 0.26) o += rc(ox + i * s + 3, oy + j * s + 3, s - 6, s - 6, 's');
        }
      }
      const a = pts[0], b = pts[pts.length - 1];
      o += pl(pts, 'd') + ci(a[0], a[1], 5.5, 'k') + ln(b[0], b[1] + 8, b[0], b[1] - 10) + pa(`M${n1(b[0])},${n1(b[1] - 10)} l11,4 -11,4 z`, 'k');
      const gy = 198;
      o += pa(`M104,${gy - 6} h12 v-12 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 z`) +
        rc(176, gy - 4, 22, 8, 't', 4) + rc(204, gy - 4, 22, 8, 't', 4) + ci(268, gy + 6, 9) + ci(294, gy - 6, 9, 's');
      return o;
    },

    design(r, v) {
      if (v === 2) {
        /* макет по модульной сетке */
        const x = 70, y = 36, w = 260, h = 164, col = w / 6;
        const lit = Math.floor(r() * 3);
        let g = rc(x, y, w, h, 'o');
        for (let i = 0; i <= 13; i++) g += ln(x + i * 20, y - 12, x + i * 20, y - (i % 2 ? 8 : 4), 't');
        for (let i = 1; i < 6; i++) g += ln(x + i * col, y, x + i * col, y + h, 'd t');
        g += rc(x + 8, y + 14, col * 4 - 16, 50, 's') + rc(x + col * 4 + 8, y + 14, col * 2 - 16, 50);
        g += ln(x + 8, y + 84, x + col * 2.4, y + 84, 'w') + textLines(x + 8, y + 100, col * 3 - 20, 3, 11, r);
        for (let i = 0; i < 3; i++) g += rc(x + col * 3 + 8 + i * col, y + 80, col - 16, col - 16, i === lit ? 'k' : '');
        return g + dimH(x, x + w, y + h + 22);
      }
      if (v === 3) {
        /* построение знака из двух окружностей */
        const cx = 200, cy = 112, rad = 62, off = 32 + r() * 14;
        const half = Math.sqrt(rad * rad - off * off);
        let g = ln(40, cy, 360, cy, 'd t') + ln(cx, 26, cx, 198, 'd t') + rc(cx - off - rad, cy - rad, 2 * (off + rad), 2 * rad, 't');
        g += ci(cx - off, cy, rad) + ci(cx + off, cy, rad);
        g += pa(`M${cx},${n1(cy - half)} A${rad},${rad} 0 0 1 ${cx},${n1(cy + half)} A${rad},${rad} 0 0 1 ${cx},${n1(cy - half)} z`, 's');
        g += rc(cx - 4, cy - half - 4, 8, 8, 'k') + rc(cx - 4, cy + half - 4, 8, 8, 'k') + ci(cx - off, cy, 3, 'k') + ci(cx + off, cy, 3, 'k');
        return g + dimH(n1(cx - off - rad), n1(cx + off + rad), cy + rad + 28);
      }
      const up = v === 0;
      const ax = 64, ay = up ? 176 : 86, bx = 336, by = up ? 86 : 176;
      const h1 = [ax + 60 + r() * 40, up ? 36 + r() * 50 : 216 - r() * 50];
      const h2 = [bx - 70 - r() * 40, up ? 206 - r() * 40 : 46 + r() * 40];
      const cxs = up ? [132, 226] : [268, 102];
      let o = ln(40, 60, 360, 60, 'd t') + ln(40, 196, 360, 196, 'd t');
      o += ci(cxs[0], 110, 44, 't') + rc(cxs[1], 112, 72, 72, 't') + ln(cxs[1], 112, cxs[1] + 72, 184, 't') + ln(cxs[1] + 72, 112, cxs[1], 184, 't');
      o += ln(ax, ay, h1[0], h1[1], 't') + ln(bx, by, h2[0], h2[1], 't');
      o += pa(`M${ax},${ay} C${n1(h1[0])},${n1(h1[1])} ${n1(h2[0])},${n1(h2[1])} ${bx},${by}`, 'w');
      o += rc(ax - 4.5, ay - 4.5, 9, 9, 'k') + rc(bx - 4.5, by - 4.5, 9, 9, 'k') + ci(h1[0], h1[1], 4, 'o') + ci(h2[0], h2[1], 4, 'o');
      const fills = ['k', 's', '', 's', ''];
      const shift = Math.floor(r() * 5);
      for (let i = 0; i < 5; i++) o += rc(147 + i * 22, 214, 16, 16, fills[(i + shift) % 5]);
      return o;
    },

    flow(r, v) {
      /* sx и sy зеркалят схему по горизонтали и вертикали: четыре раскладки из одной. */
      const sx = v & 1 ? -1 : 1, sy = v & 2 ? -1 : 1, bw = 78, bh = 36;
      const cx = [200 - 116 * sx, 200, 200 + 116 * sx], cy = [117 - 47 * sy, 117 + 47 * sy];
      const lit = Math.floor(r() * 3);
      const box = (i, j, on) => rc(cx[i] - bw / 2, cy[j] - bh / 2, bw, bh, on ? 's' : 'o') +
        ln(cx[i] - 26, cy[j] - 5, cx[i] + 6 + r() * 18, cy[j] - 5, 't') + ln(cx[i] - 26, cy[j] + 6, cx[i] - 6 + r() * 14, cy[j] + 6, 't');
      let o = arrow(cx[0] + sx * bw / 2, cy[0], cx[1] - sx * 28, cy[0]) + arrow(cx[1] + sx * 28, cy[0], cx[2] - sx * bw / 2, cy[0]) +
        arrow(cx[1], cy[0] + sy * 28, cx[1], cy[1] - sy * bh / 2) + arrow(cx[2], cy[0] + sy * bh / 2, cx[2], cy[1] - sy * 25) +
        arrow(cx[1] + sx * bw / 2, cy[1], cx[2] - sx * 25, cy[1]) + ln(cx[0], cy[0] + sy * bh / 2, cx[0], cy[1] - sy * 24, 'd');
      o += box(0, 0, lit === 0) + pa(`M${cx[1]},${cy[0] - 28} l28,28 -28,28 -28,-28 z`, 'o') + box(2, 0, lit === 1) + box(1, 1, lit === 2);
      const dx = cx[2], dy = cy[1];
      o += pa(`M${dx - 24},${dy - 15} v30 a24,8 0 0 0 48,0 v-30`, 'o') +
        `<ellipse cx="${dx}" cy="${dy - 15}" rx="24" ry="8" class="o"/>` + pa(`M${dx - 24},${dy - 2} a24,8 0 0 0 48,0`, 't');
      const gx = cx[0], gy = cy[1];
      o += ci(gx, gy, 15, 'o') + ci(gx, gy, 5);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.2;
        o += ln(gx + 15 * Math.cos(a), gy + 15 * Math.sin(a), gx + 21 * Math.cos(a), gy + 21 * Math.sin(a), 'w');
      }
      return o + dimH(84 - bw / 2, 316 + bw / 2, 222);
    },

    doc(r) {
      let o = '';
      for (let i = 0; i < 3; i++) {
        const x = 104 + i * 24, y = 18 + i * 12, w = 150, h = 190, f = 22;
        o += pa(`M${x},${y} h${w - f} l${f},${f} v${h - f} h${-w} z`, 'o');
        if (i === 2) {
          const tw = w - 32, ty = y + 96, th = 60;
          o += pa(`M${x + w - f},${y} v${f} h${f}`) + ln(x + 16, y + 26, x + 78, y + 26, 'w') + textLines(x + 16, y + 44, tw, 4, 11, r);
          o += rc(x + 16, ty, tw, th) + rc(x + 16, ty, tw, 15, 's') + ln(x + 16, ty + 30, x + 16 + tw, ty + 30, 't') + ln(x + 16, ty + 45, x + 16 + tw, ty + 45, 't') +
            ln(x + 16 + tw * 0.4, ty, x + 16 + tw * 0.4, ty + th, 't') + ln(x + 16 + tw * 0.72, ty, x + 16 + tw * 0.72, ty + th, 't');
          o += pa(`M${x + 16},${y + h - 14} q8,-12 16,0 t16,0 t14,-4`, 't');
        }
      }
      return o + dimV(330, 42, 232);
    },

    cube(r) {
      const cx = 200, cy = 114, e = 64 + Math.floor(r() * 10), dx = e * 0.866;
      const A = [cx, cy - e], B = [cx + dx, cy - e / 2], C = [cx + dx, cy + e / 2], D = [cx, cy + e], E = [cx - dx, cy + e / 2], F = [cx - dx, cy - e / 2], G = [cx, cy];
      let o = ln(cx, cy - e - 20, cx, cy + e + 16, 'd t');
      o += pl([A, B, C, D, E, F, A], 'o') + pl([F, G, B]) + ln(G[0], G[1], D[0], D[1]);
      o += ln(G[0], G[1], A[0], A[1], 'd t') + ln(G[0], G[1], E[0], E[1], 'd t') + ln(G[0], G[1], C[0], C[1], 'd t');
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        o += ln(G[0] + (B[0] - G[0]) * t, G[1] + (B[1] - G[1]) * t, D[0] + (C[0] - D[0]) * t, D[1] + (C[1] - D[1]) * t, 't');
      }
      return o + dimV(n1(B[0] + 30), B[1], C[1]) + dimH(E[0], D[0], n1(D[1] + 26));
    },

    arcs(r) {
      const cx = 200, cy = 190;
      let o = ln(52, cy, 348, cy) + ln(cx, cy + 14, cx, 34, 'd t');
      [48, 84, 120].forEach((rad, i) => {
        o += pa(`M${cx - rad},${cy} A${rad},${rad} 0 0 1 ${cx + rad},${cy}`, i === 2 ? '' : 't');
      });
      for (let d = 0; d <= 180; d += 10) {
        const a = (d * Math.PI) / 180;
        const far = d % 30 === 0 ? 134 : 128;
        o += ln(cx - 120 * Math.cos(a), cy - 120 * Math.sin(a), cx - far * Math.cos(a), cy - far * Math.sin(a), d % 30 === 0 ? '' : 't');
      }
      const a = ((30 + r() * 120) * Math.PI) / 180;
      const a2 = a > Math.PI / 2 ? a - 0.6 : a + 0.6;
      const at = (ang, rad) => `${n1(cx - rad * Math.cos(ang))},${n1(cy - rad * Math.sin(ang))}`;
      o += pa(`M${cx},${cy} L${at(a, 84)} A84,84 0 0 ${a2 > a ? 1 : 0} ${at(a2, 84)} z`, 's');
      return o + arrow(cx, cy, cx - 112 * Math.cos(a), cy - 112 * Math.sin(a), 'w') + ci(cx, cy, 5, 'k');
    }
  };

  /* Слово целиком или его начало: «бот» найдётся в «Боты», но не в «Разработка». */
  const starts = (alts) => new RegExp('(^|[^a-zа-я0-9])(' + alts + ')');

  const MOTIF_RULES = [
    [starts('сайт|лендинг|landing|магазин|web|веб|страниц'), 'browser'],
    [starts('бот|bot|чат|мессенджер'), 'chat'],
    [starts('приложен|app|мобильн|ios|android'), 'phone'],
    [starts('сервис|saas|crm|дашборд|панел|аналитик'), 'dashboard'],
    [starts('игр|game'), 'game'],
    [starts('дизайн|design|ui|бренд|логотип|стил|шаблон|график'), 'design'],
    [starts('автоматизац|скрипт|интеграц|парсер|script|api'), 'flow'],
    [starts('документ|курс|гайд|книг|текст|чертеж'), 'doc']
  ];

  const GENERIC_MOTIFS = ['cube', 'arcs', 'doc', 'flow'];

  /* Сколько раскладок у вида обложки и можно ли дополнительно отразить его зеркально. */
  const MOTIF_META = {
    browser: { layouts: 4, mirror: true },
    chat: { layouts: 4, mirror: true },
    phone: { layouts: 3, mirror: true },
    dashboard: { layouts: 2, mirror: true },
    game: { layouts: 1, mirror: true },
    design: { layouts: 4, mirror: false },
    flow: { layouts: 4, mirror: false },
    doc: { layouts: 1, mirror: true },
    cube: { layouts: 1, mirror: true },
    arcs: { layouts: 1, mirror: true }
  };

  function motifFor(p) {
    if (p.cover && MOTIFS[p.cover]) return p.cover;
    const text = norm(p.category);
    for (let i = 0; i < MOTIF_RULES.length; i++) {
      if (MOTIF_RULES[i][0].test(text)) return MOTIF_RULES[i][1];
    }
    return GENERIC_MOTIFS[hash(text) % GENERIC_MOTIFS.length];
  }

  /* Каждый проект просит раскладку по своему id. Если её уже занял проект выше
     по списку с таким же видом обложки, берётся следующая свободная. */
  (function assignCoverVariants() {
    const taken = {};
    projects.forEach((p) => {
      p.motif = motifFor(p);
      const meta = MOTIF_META[p.motif];
      const total = meta.layouts * (meta.mirror ? 2 : 1);
      const used = taken[p.motif] || (taken[p.motif] = new Set());
      let v = hash(p.id) % total;
      if (used.size < total) {
        while (used.has(v)) v = (v + 1) % total;
      }
      used.add(v);
      p.variant = v;
    });
  })();

  function coverSvg(p) {
    const meta = MOTIF_META[p.motif];
    const art = MOTIFS[p.motif](rng(hash(p.id)), p.variant % meta.layouts);
    const mirrored = meta.mirror && p.variant >= meta.layouts;
    return `<svg class="cv" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
      `<g class="cv-ink"${mirrored ? ' transform="matrix(-1 0 0 1 400 0)"' : ''}>${art}</g></svg>`;
  }

  function mediaHtml(p) {
    if (p.image) return `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" data-fallback="${esc(p.id)}">`;
    return coverSvg(p);
  }

  /* ====================================================================
     Состояние и адресная строка
     ==================================================================== */

  const SORTS = {
    default: null,
    new: (a, b) => b.addedTs - a.addedTs,
    cheap: byPrice(1),
    expensive: byPrice(-1)
  };

  function byPrice(dir) {
    return function (a, b) {
      if (a.price == null && b.price == null) return 0;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return dir * (a.price - b.price);
    };
  }

  const state = { q: '', cat: '', sort: 'default' };
  const CART_KEY = 'shop:cart';
  const THEME_KEY = 'shop:theme';
  const OWN_PARAMS = ['q', 'cat', 'sort', 'project'];

  let cart = [];
  let overlay = null;          // null | { view: 'project', id } | { view: 'cart' }
  let cartStep = 'list';       // 'list' | 'form' | 'done'
  let lastOrder = null;
  let draft = { name: '', contact: '', comment: '', agree: false };
  let historyOk = true;

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const cat = params.get('cat') || '';
    const sort = params.get('sort') || '';
    state.q = (params.get('q') || '').trim().slice(0, 80);
    state.cat = categories.some((c) => c.name === cat) ? cat : '';
    state.sort = Object.prototype.hasOwnProperty.call(SORTS, sort) ? sort : 'default';
  }

  function buildUrl(projectId) {
    const params = new URLSearchParams(location.search);
    OWN_PARAMS.forEach((key) => params.delete(key));
    if (state.q) params.set('q', state.q);
    if (state.cat) params.set('cat', state.cat);
    if (state.sort !== 'default') params.set('sort', state.sort);
    if (projectId) params.set('project', projectId);
    const query = params.toString();
    return location.pathname + (query ? '?' + query : '') + location.hash;
  }

  const projectHref = (id) => '?project=' + encodeURIComponent(id);

  function shareUrl(id) {
    return location.href.split('#')[0].split('?')[0] + projectHref(id);
  }

  /* История браузера нужна для кнопки «Назад». Если она недоступна
     (страница открыта из файла или встроена в другое окно), сайт работает и без неё. */
  function writeHistory(mode, data, url) {
    if (!historyOk) return;
    try {
      history[mode === 'push' ? 'pushState' : 'replaceState'](data, '', url);
    } catch (e) {
      historyOk = false;
    }
  }

  function historyState() {
    if (!historyOk) return null;
    try {
      return history.state;
    } catch (e) {
      return null;
    }
  }

  function overlayFromLocation() {
    const st = historyState();
    if (st && st.view === 'cart') return { view: 'cart' };
    const id = new URLSearchParams(location.search).get('project');
    if (id && byId.has(id)) return { view: 'project', id };
    return null;
  }

  /* ====================================================================
     Элементы страницы
     ==================================================================== */

  const gridEl = $('#grid');
  const emptyEl = $('#empty');
  const emptyTextEl = $('#empty-text');
  const resultEl = $('#result-count');
  const chipsEl = $('#chips');
  const searchEl = $('#search');
  const sortEl = $('#sort');
  const cartCountEl = $('#cart-count');
  const cartOpenEl = $('#cart-open');
  const projectDlg = $('#project-dialog');
  const projectBox = $('#project-box');
  const cartDlg = $('#cart-dialog');
  const cartBox = $('#cart-box');
  const toastEl = $('#toast');
  const metaDescription = $('meta[name="description"]');

  if (!gridEl || !projectDlg || !cartDlg) return;

  const baseTitle = `${CFG.brand.name} — ${lowerFirst(CFG.brand.tagline)}`;
  const baseDescription = metaDescription ? metaDescription.getAttribute('content') : '';

  /* ====================================================================
     Каталог
     ==================================================================== */

  function visibleProjects() {
    const tokens = norm(state.q).split(/\s+/).filter(Boolean);
    const compare = SORTS[state.sort];
    return projects
      .filter((p) => (!state.cat || p.category === state.cat) && tokens.every((t) => p.hay.includes(t)))
      .map((p, i) => [p, i])
      .sort((a, b) => (a[0].sold - b[0].sold) || (compare ? compare(a[0], b[0]) : 0) || (a[1] - b[1]))
      .map((pair) => pair[0]);
  }

  function cartButtonHtml(p, extra) {
    if (p.sold) return `<span class="btn ${extra} is-disabled">Продано</span>`;
    return `<button type="button" class="btn ${extra}" data-cart="${esc(p.id)}"></button>`;
  }

  function syncCartButton(btn) {
    const p = byId.get(btn.dataset.cart);
    if (!p) return;
    const inCart = cart.includes(p.id);
    btn.classList.toggle('is-in', inCart);
    btn.innerHTML = inCart ? icon('check') + '<span>В корзине</span>' : '<span>В корзину</span>';
    btn.setAttribute('aria-label', inCart ? `«${p.title}» в корзине. Открыть корзину` : `Добавить в корзину: ${p.title}`);
  }

  function cardHtml(p) {
    const tags = [];
    const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    if (p.badge) tags.push(`<span class="tag">${esc(p.badge)}</span>`);
    if (discount > 0) tags.push(`<span class="tag tag--rev">−${discount}%</span>`);
    return `<li class="card${p.sold ? ' is-sold' : ''}"><article class="card__in">
      <div class="cover">${mediaHtml(p)}${tags.length ? `<div class="cover__tags">${tags.join('')}</div>` : ''}${p.sold ? '<span class="stamp">Продано</span>' : ''}</div>
      <div class="card__body">
        <p class="label">${esc(p.category)}</p>
        <h3 class="card__title"><a href="${esc(projectHref(p.id))}" data-open="${esc(p.id)}">${esc(p.title)}</a></h3>
        ${p.summary ? `<p class="card__summary">${esc(p.summary)}</p>` : ''}
        ${p.stack.length ? `<ul class="stack" aria-label="Технологии">${p.stack.slice(0, 4).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="card__foot">
        <p class="card__price">${priceHtml(p)}</p>
        ${cartButtonHtml(p, 'btn--cell')}
      </div>
    </article></li>`;
  }

  function renderGrid() {
    const list = visibleProjects();
    const total = projects.length;
    const filtered = !!(state.q || state.cat);
    gridEl.innerHTML = list.map(cardHtml).join('');
    gridEl.hidden = !list.length;
    emptyEl.hidden = !!list.length;
    $$('[data-cart]', gridEl).forEach(syncCartButton);

    if (!total) {
      const controls = $('.controls');
      if (controls) controls.hidden = true; // искать и сортировать пока нечего
      resultEl.textContent = 'Каталог пуст';
      emptyTextEl.textContent = 'Добавьте проекты в файл js/projects.js, и они появятся здесь.';
      $('.empty__title', emptyEl).textContent = 'Проектов пока нет';
      $('[data-reset]', emptyEl).hidden = true;
      return;
    }
    resultEl.textContent = filtered
      ? `Найдено ${list.length} из ${total}`
      : `${total} ${plural(total, PROJECT_FORMS)}`;
    if (!list.length) {
      emptyTextEl.textContent = state.q
        ? `По запросу «${state.q}»${state.cat ? ` в категории «${state.cat}»` : ''} ничего нет. Попробуйте другие слова.`
        : 'В этой категории пока нет проектов.';
    }
  }

  function renderChips() {
    chipsEl.hidden = categories.length < 2;
    chipsEl.innerHTML = `<button type="button" class="chip" data-cat="">Все <span class="chip__n">${projects.length}</span></button>` +
      categories.map((c) => `<button type="button" class="chip" data-cat="${esc(c.name)}">${esc(c.name)} <span class="chip__n">${c.count}</span></button>`).join('');
  }

  function syncControls() {
    if (searchEl.value.trim() !== state.q) searchEl.value = state.q;
    sortEl.value = state.sort;
    $$('.chip', chipsEl).forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.cat === state.cat)));
  }

  function applyFilters() {
    syncControls();
    renderGrid();
    writeHistory('replace', historyState(), buildUrl(overlay && overlay.view === 'project' ? overlay.id : null));
  }

  function renderStats() {
    const set = (key, text) => {
      const el = $(`[data-stat="${key}"]`);
      if (el) el.textContent = text;
    };
    const priced = projects.filter((p) => !p.sold && p.price > 0).map((p) => p.price);
    const latest = projects.reduce((max, p) => Math.max(max, p.addedTs), 0);
    set('count', String(projects.length));
    set('cats', String(categories.length));
    set('from', priced.length ? money(Math.min.apply(null, priced)) : '—');
    set('updated', latest ? dateText(latest) : '—');
  }

  /* ====================================================================
     Окно проекта
     ==================================================================== */

  function askLink(p) {
    const c = CFG.contacts;
    const text = `Здравствуйте! Вопрос по проекту «${p.title}»: ${shareUrl(p.id)}`;
    if (c.telegram) return `https://t.me/${c.telegram}?text=${encodeURIComponent(text)}`;
    if (c.whatsapp) return `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(text)}`;
    if (c.email) return `mailto:${c.email}?subject=${encodeURIComponent('Вопрос по проекту «' + p.title + '»')}&body=${encodeURIComponent(text)}`;
    return '';
  }

  function galleryHtml(p) {
    const images = [p.image].concat(p.gallery).filter((src, i, all) => src && all.indexOf(src) === i);
    if (!images.length) return `<div class="cover">${coverSvg(p)}</div>`;
    let html = `<div class="cover"><img id="pv-image" src="${esc(images[0])}" alt="${esc(p.title)}" decoding="async" data-fallback="${esc(p.id)}"></div>`;
    if (images.length > 1) {
      html += `<div class="thumbs" role="group" aria-label="Изображения проекта">` + images.map((src, i) =>
        `<button type="button" class="thumb" data-thumb="${esc(src)}" aria-pressed="${i === 0}" aria-label="Изображение ${i + 1} из ${images.length}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async"></button>`
      ).join('') + '</div>';
    }
    return html;
  }

  function listBlock(title, items) {
    if (!items.length) return '';
    return `<div class="pv__block"><h3>${title}</h3><ul class="ticks">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  }

  function renderProject(p) {
    const specs = [['Категория', p.category]].concat(p.specs);
    if (p.addedTs) specs.push(['Добавлен', dateText(p.addedTs)]);
    const paragraphs = p.description.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const related = projects.filter((x) => x.category === p.category && x.id !== p.id && !x.sold).slice(0, 3);
    const ask = askLink(p);
    const links = [];
    if (p.demoUrl) links.push(`<a class="btn btn--sm" href="${esc(p.demoUrl)}" target="_blank" rel="noopener">Открыть демо ${icon('ext')}</a>`);
    if (ask) links.push(`<a class="btn btn--sm" href="${esc(ask)}" target="_blank" rel="noopener">Задать вопрос</a>`);

    const actions = [];
    if (p.sold) {
      actions.push('<span class="btn is-disabled">Продано</span>');
    } else {
      if (p.buyUrl) actions.push(`<a class="btn btn--primary" href="${esc(p.buyUrl)}" target="_blank" rel="noopener">Оплатить онлайн ${icon('ext')}</a>`);
      actions.push(cartButtonHtml(p, p.buyUrl ? '' : 'btn--primary'));
    }

    projectBox.innerHTML = `
      <header class="dlg__bar">
        <p class="label">${esc(p.category)}</p>
        <div class="dlg__tools">
          <button type="button" class="btn btn--sm" data-share="${esc(p.id)}">${icon('link')}<span>Скопировать ссылку</span></button>
          <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('close')}</button>
        </div>
      </header>
      <div class="dlg__scroll">
        <div class="pv">
          <div class="pv__cover">${galleryHtml(p)}</div>
          <div class="pv__head">
            <h2 class="pv__title" id="project-title" tabindex="-1" autofocus>${esc(p.title)}</h2>
            ${p.summary ? `<p class="lead">${esc(p.summary)}</p>` : ''}
            ${links.length ? `<div class="pv__links">${links.join('')}</div>` : ''}
          </div>
          <dl class="specs">${specs.map((row) => `<dt>${esc(row[0])}</dt><dd>${esc(row[1])}</dd>`).join('')}</dl>
          <div class="pv__more">
            ${paragraphs.length ? `<div class="pv__text">${paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
            ${listBlock('Возможности', p.features)}
            ${listBlock('Что входит', p.includes)}
            ${p.stack.length ? `<div class="pv__block"><h3>Технологии</h3><ul class="stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
            ${related.length ? `<div class="pv__block"><h3>Ещё в категории «${esc(p.category)}»</h3><div class="related">${related.map((x) =>
              `<a href="${esc(projectHref(x.id))}" data-open="${esc(x.id)}"><span>${esc(x.title)}</span><span>${esc(priceText(x))}</span></a>`).join('')}</div></div>` : ''}
          </div>
        </div>
      </div>
      <footer class="dlg__foot">
        <p class="pv__price">${priceHtml(p)}</p>
        <div class="pv__actions">${actions.join('')}</div>
      </footer>`;
    $$('[data-cart]', projectBox).forEach(syncCartButton);
  }

  /* ====================================================================
     Корзина и заявка
     ==================================================================== */

  function loadCart() {
    const saved = store.get(CART_KEY, []);
    if (!Array.isArray(saved)) return [];
    return saved.filter((id, i) => typeof id === 'string' && saved.indexOf(id) === i && byId.has(id) && !byId.get(id).sold);
  }

  function setCart(next) {
    cart = next;
    store.set(CART_KEY, cart);
    updateCartUi();
  }

  function cartItems() {
    return cart.map((id) => byId.get(id)).filter(Boolean);
  }

  function totals(items) {
    let sum = 0;
    let ask = 0;
    items.forEach((p) => {
      if (p.price == null) ask++;
      else sum += p.price;
    });
    return { sum, ask };
  }

  function totalText(t) {
    if (!t.ask) return money(t.sum);
    return t.sum > 0 ? money(t.sum) + ' + по запросу' : 'По запросу';
  }

  function updateCartUi() {
    const n = cart.length;
    cartCountEl.textContent = String(n);
    cartCountEl.hidden = !n;
    cartOpenEl.setAttribute('aria-label', n ? `Корзина: ${n} ${plural(n, PROJECT_FORMS)}` : 'Корзина пуста');
    $$('[data-cart]').forEach(syncCartButton);
    if (overlay && overlay.view === 'cart' && cartStep === 'list') renderCart();
  }

  function bumpCount() {
    cartCountEl.classList.remove('is-bump');
    void cartCountEl.offsetWidth;
    cartCountEl.classList.add('is-bump');
  }

  function barHtml(title, back) {
    return `<header class="dlg__bar">
      ${back ? `<button type="button" class="icon-btn" data-step="list" aria-label="Назад в корзину">${icon('back')}</button>` : ''}
      <h2 id="cart-title" tabindex="-1" autofocus>${title}</h2>
      <div class="dlg__tools"><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('close')}</button></div>
    </header>`;
  }

  function cartListHtml(items) {
    if (!items.length) {
      return barHtml('Корзина') + `<div class="dlg__scroll"><div class="cart"><div class="cart__empty">
        <p>В корзине пока ничего нет. Добавьте проект из каталога, и он появится здесь.</p>
        <button type="button" class="btn btn--primary" data-to-catalog>Перейти в каталог</button>
      </div></div></div>`;
    }
    const t = totals(items);
    return barHtml('Корзина') + `<div class="dlg__scroll"><div class="cart">
        <ul>${items.map((p) => `<li class="ci">
          <div class="cover">${mediaHtml(p)}</div>
          <div><a class="ci__title" href="${esc(projectHref(p.id))}" data-open="${esc(p.id)}">${esc(p.title)}</a><span class="ci__price">${esc(priceText(p))}</span></div>
          <button type="button" class="icon-btn" data-remove="${esc(p.id)}" aria-label="Убрать из корзины: ${esc(p.title)}">${icon('trash')}</button>
        </li>`).join('')}</ul>
        <button type="button" class="cart__clear" data-clear>Очистить корзину</button>
      </div></div>
      <footer class="dlg__foot">
        <p class="total"><span class="label">Итого, ${items.length} ${plural(items.length, PROJECT_FORMS)}</span><span class="price">${esc(totalText(t))}</span></p>
        <button type="button" class="btn btn--primary" data-step="form">Оформить заявку ${icon('arrow')}</button>
      </footer>`;
  }

  function cartFormHtml(items) {
    const t = totals(items);
    const legal = CFG.legal;
    const consent = legal.privacyUrl ? `<div class="field">
        <label class="check"><input type="checkbox" id="order-agree" name="agree"${draft.agree ? ' checked' : ''} aria-describedby="order-agree-err">
        <span>Согласен на обработку персональных данных. <a href="${esc(legal.privacyUrl)}" target="_blank" rel="noopener">Политика конфиденциальности</a></span></label>
        <p class="field__err" id="order-agree-err" hidden></p>
      </div>` : '';
    return barHtml('Заявка', true) + `<div class="dlg__scroll"><div class="cart">
        <form class="form" id="order-form" novalidate>
          <div class="field">
            <label for="order-name">Как к вам обращаться</label>
            <input id="order-name" name="name" type="text" autocomplete="name" maxlength="80" value="${esc(draft.name)}" aria-describedby="order-name-err">
            <p class="field__err" id="order-name-err" hidden></p>
          </div>
          <div class="field">
            <label for="order-contact">Telegram, телефон или почта</label>
            <input id="order-contact" name="contact" type="text" autocomplete="off" autocapitalize="off" maxlength="120" value="${esc(draft.contact)}" aria-describedby="order-contact-hint order-contact-err">
            <p class="field__hint" id="order-contact-hint">По этому контакту продавец ответит на заявку.</p>
            <p class="field__err" id="order-contact-err" hidden></p>
          </div>
          <div class="field">
            <label for="order-comment">Комментарий <span class="opt">(необязательно)</span></label>
            <textarea id="order-comment" name="comment" maxlength="1000">${esc(draft.comment)}</textarea>
          </div>
          <div class="hp" aria-hidden="true"><label>Не заполняйте это поле <input id="order-site" name="_gotcha" type="text" tabindex="-1" autocomplete="off"></label></div>
          ${consent}
          <ul class="order-sum" aria-label="Состав заявки">${items.map((p) => `<li><span>${esc(p.title)}</span><span>${esc(priceText(p))}</span></li>`).join('')}</ul>
        </form>
      </div></div>
      <footer class="dlg__foot">
        <p class="total"><span class="label">Итого</span><span class="price">${esc(totalText(t))}</span></p>
        <button type="submit" class="btn btn--primary" form="order-form" id="order-submit">${CFG.orderEndpoint ? 'Отправить заявку' : 'Продолжить'} ${icon('arrow')}</button>
      </footer>`;
  }

  function orderChannels(order) {
    const c = CFG.contacts;
    const text = encodeURIComponent(order.text);
    const out = [];
    if (c.telegram) out.push({ icon: 'send', label: 'Отправить в Telegram', href: `https://t.me/${c.telegram}?text=${text}`, addr: '@' + c.telegram });
    if (c.whatsapp) out.push({ icon: 'chat', label: 'Отправить в WhatsApp', href: `https://wa.me/${c.whatsapp}?text=${text}`, addr: '+' + c.whatsapp });
    if (c.email) {
      out.push({
        icon: 'mail',
        label: 'Отправить по почте',
        href: `mailto:${c.email}?subject=${encodeURIComponent('Заявка № ' + order.id)}&body=${encodeURIComponent(order.text.replace(/\n/g, '\r\n'))}`,
        addr: c.email
      });
    }
    return out;
  }

  function cartDoneHtml(order) {
    if (order.status === 'sent') {
      return barHtml('Заявка отправлена') + `<div class="dlg__scroll"><div class="cart"><div class="done">
          <h3 id="done-title" tabindex="-1">Заявка № ${esc(order.id)} у продавца</h3>
          <p>Ответ придёт по контакту, который вы указали: ${esc(order.contact)}.</p>
        </div></div></div>
        <footer class="dlg__foot"><button type="button" class="btn btn--primary" data-finish>Готово</button></footer>`;
    }
    const channels = orderChannels(order);
    const failed = order.status === 'failed';
    const how = channels.length
      ? 'Выберите способ: текст заявки подставится в сообщение.'
      : 'Скопируйте текст заявки и отправьте его продавцу.';
    const intro = failed
      ? 'Сайт не смог передать заявку сам. ' + how
      : how + ' Пока заявка не отправлена, продавец о ней не знает.';
    return barHtml('Отправка заявки') + `<div class="dlg__scroll"><div class="cart"><div class="done">
        <h3 id="done-title" tabindex="-1">Отправьте заявку № ${esc(order.id)} продавцу</h3>
        <p>${intro}</p>
        ${channels.length ? `<div class="done__channels">${channels.map((ch) =>
          `<a class="btn btn--primary" href="${esc(ch.href)}" target="_blank" rel="noopener" data-sent>${icon(ch.icon)}<span>${ch.label}</span></a>`).join('')}</div>` : ''}
        <label class="label" for="order-text">Текст заявки</label>
        <textarea class="done__text" id="order-text" readonly>${esc(order.text)}</textarea>
        <button type="button" class="btn" data-copy="order-text">${icon('copy')}<span>Скопировать текст</span></button>
        ${channels.length ? `<p>Адрес продавца: ${channels.map((ch) => `<span class="done__addr">${esc(ch.addr)}</span>`).join(', ')}</p>` : ''}
        ${channels.length ? '' : '<p class="done__note">Способы связи с продавцом не настроены. Владельцу сайта: укажите почту или Telegram в файле js/config.js.</p>'}
      </div></div></div>
      <footer class="dlg__foot">
        <button type="button" class="btn" data-step="list">Назад в корзину</button>
        <button type="button" class="btn" data-finish>Готово</button>
      </footer>`;
  }

  function renderCart() {
    const items = cartItems();
    if (cartStep === 'done' && !lastOrder) cartStep = 'list';
    if (cartStep === 'form' && !items.length) cartStep = 'list';
    if (cartStep === 'list') cartBox.innerHTML = cartListHtml(items);
    else if (cartStep === 'form') cartBox.innerHTML = cartFormHtml(items);
    else cartBox.innerHTML = cartDoneHtml(lastOrder);
  }

  function goToStep(step) {
    cartStep = step;
    renderCart();
    const target = step === 'done' ? $('#done-title', cartBox) : step === 'form' ? $('#order-name', cartBox) : $('#cart-title', cartBox);
    if (target) target.focus();
    const scroller = $('.dlg__scroll', cartBox);
    if (scroller) scroller.scrollTop = 0;
  }

  function readDraft(form) {
    draft = {
      name: form.elements.name.value.trim(),
      contact: form.elements.contact.value.trim(),
      comment: form.elements.comment.value.trim(),
      agree: form.elements.agree ? form.elements.agree.checked : false
    };
  }

  function setFieldError(form, name, message) {
    const input = form.elements[name];
    const err = $(`#order-${name}-err`, form);
    if (!input || !err) return;
    err.textContent = message || '';
    err.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function validateOrder(form) {
    const errors = {};
    if (draft.name.length < 2) errors.name = 'Напишите, как к вам обращаться.';
    if (draft.contact.length < 3) errors.contact = 'Укажите контакт, чтобы продавец смог ответить.';
    if (form.elements.agree && !draft.agree) errors.agree = 'Отметьте согласие, чтобы отправить заявку.';
    ['name', 'contact', 'agree'].forEach((name) => setFieldError(form, name, errors[name]));
    const first = Object.keys(errors)[0];
    if (first) form.elements[first].focus();
    return !first;
  }

  function buildOrder(items) {
    const now = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const id = two(now.getMonth() + 1) + two(now.getDate()) + '-' + String(Math.floor(1000 + Math.random() * 9000));
    const t = totals(items);
    const lines = ['Заявка № ' + id, CFG.brand.name, '', 'Проекты:'];
    items.forEach((p, i) => lines.push(`${i + 1}. ${p.title}: ${priceText(p)}`));
    lines.push('Итого: ' + totalText(t), '', 'Имя: ' + draft.name, 'Контакт: ' + draft.contact);
    if (draft.comment) lines.push('Комментарий: ' + draft.comment);
    return {
      id,
      status: 'manual',
      text: lines.join('\n'),
      name: draft.name,
      contact: draft.contact,
      comment: draft.comment,
      items: items.map((p) => ({ id: p.id, title: p.title, price: p.price })),
      total: t.sum,
      hasPriceOnRequest: t.ask > 0
    };
  }

  function postOrder(order) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : 0;
    return fetch(CFG.orderEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        name: order.name,
        contact: order.contact,
        comment: order.comment,
        items: order.items,
        total: order.total,
        hasPriceOnRequest: order.hasPriceOnRequest,
        currency: CFG.currency,
        message: order.text,
        page: location.href.split('#')[0]
      }),
      signal: ctrl ? ctrl.signal : undefined
    }).then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    }).finally(() => clearTimeout(timer));
  }

  let sending = false;

  function submitOrder(form) {
    if (sending) return;
    const items = cartItems();
    if (!items.length) return goToStep('list');
    readDraft(form);
    if (!validateOrder(form)) return;
    if (form.elements._gotcha && form.elements._gotcha.value) return; // поле-ловушка заполняют только роботы

    const order = buildOrder(items);
    lastOrder = order;
    if (!CFG.orderEndpoint) return goToStep('done');

    const submit = $('#order-submit', cartBox);
    sending = true;
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Отправляем…';
    }
    postOrder(order).then(() => {
      order.status = 'sent';
      setCart([]);
      draft.comment = '';
    }, () => {
      order.status = 'failed';
    }).then(() => {
      sending = false;
      goToStep('done');
    });
  }

  /* ====================================================================
     Окна и история
     ==================================================================== */

  function updateMeta() {
    const p = overlay && overlay.view === 'project' ? byId.get(overlay.id) : null;
    document.title = p ? `${p.title} — ${CFG.brand.name}` : baseTitle;
    if (metaDescription) metaDescription.setAttribute('content', p && p.summary ? p.summary : baseDescription);
  }

  function applyOverlay() {
    const wantProject = !!overlay && overlay.view === 'project';
    const wantCart = !!overlay && overlay.view === 'cart';
    if (!wantProject && projectDlg.open) projectDlg.close();
    if (!wantCart && cartDlg.open) cartDlg.close();
    if (wantProject) {
      renderProject(byId.get(overlay.id));
      if (!projectDlg.open) projectDlg.showModal();
      else $('#project-title', projectBox).focus();
      $('.dlg__scroll', projectBox).scrollTop = 0;
    }
    if (wantCart) {
      renderCart();
      if (!cartDlg.open) cartDlg.showModal();
    }
    root.classList.toggle('is-locked', !!overlay);
    updateMeta();
  }

  function openProject(id) {
    if (!byId.has(id)) return;
    const st = historyState();
    const pushed = !!(st && st.pushed);
    if (overlay) writeHistory('replace', { view: 'project', id, pushed }, buildUrl(id));
    else writeHistory('push', { view: 'project', id, pushed: true }, buildUrl(id));
    overlay = { view: 'project', id };
    applyOverlay();
  }

  function openCart(step) {
    cartStep = step || 'list';
    const st = historyState();
    const pushed = !!(st && st.pushed);
    if (overlay) writeHistory('replace', { view: 'cart', pushed }, buildUrl(null));
    else writeHistory('push', { view: 'cart', pushed: true }, buildUrl(null));
    overlay = { view: 'cart' };
    applyOverlay();
  }

  function closeOverlay() {
    if (!overlay) return;
    const st = historyState();
    overlay = null;
    applyOverlay();
    if (st && st.pushed) history.back();
    else writeHistory('replace', null, buildUrl(null));
  }

  /* ====================================================================
     Уведомления, копирование, тема
     ==================================================================== */

  let toastTimer = 0;

  function toast(text) {
    const host = $('dialog[open]') || document.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  }

  function copyText(text) {
    const legacy = () => {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        ($('dialog[open]') || document.body).appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch (e) {
        return false;
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, legacy);
    }
    return Promise.resolve(legacy());
  }

  function currentTheme() {
    const set = root.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) { /* без сохранения */ }
  }

  /* ====================================================================
     Настройки на странице: название, контакты, ссылки
     ==================================================================== */

  function contactLinksHtml() {
    const c = CFG.contacts;
    const out = [];
    if (c.telegram) out.push(`<a class="btn btn--on-blue" href="https://t.me/${esc(c.telegram)}" target="_blank" rel="noopener">${icon('send')}<span>Telegram: @${esc(c.telegram)}</span></a>`);
    if (c.whatsapp) out.push(`<a class="btn btn--on-blue" href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener">${icon('chat')}<span>WhatsApp: +${esc(c.whatsapp)}</span></a>`);
    if (c.email) out.push(`<a class="btn btn--on-blue" href="mailto:${esc(c.email)}">${icon('mail')}<span>${esc(c.email)}</span></a>`);
    if (c.phone) out.push(`<a class="btn btn--on-blue" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span>${esc(c.phone)}</span></a>`);
    return out.join('') || '<p>Контакты появятся здесь, когда вы укажете их в файле js/config.js.</p>';
  }

  function applyConfig() {
    $$('[data-brand]').forEach((el) => { el.textContent = CFG.brand.name; });
    $$('[data-tagline]').forEach((el) => { el.textContent = CFG.brand.tagline; });
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
    const demoBar = $('#demo-bar');
    if (demoBar) demoBar.hidden = !CFG.demo;
    const contacts = $('#contact-links');
    if (contacts) contacts.innerHTML = contactLinksHtml();
    const legal = $('#legal-links');
    if (legal) {
      legal.innerHTML =
        (CFG.legal.privacyUrl ? `<a href="${esc(CFG.legal.privacyUrl)}" target="_blank" rel="noopener">Конфиденциальность</a>` : '') +
        (CFG.legal.offerUrl ? `<a href="${esc(CFG.legal.offerUrl)}" target="_blank" rel="noopener">Оферта</a>` : '');
    }
  }

  /* ====================================================================
     События
     ==================================================================== */

  /* Покупатель открыл почту или мессенджер либо скопировал текст:
     теперь главная кнопка на шаге отправки это «Готово». */
  function markOrderHandled() {
    const finish = $('[data-finish]', cartBox);
    if (finish) finish.classList.add('btn--primary');
  }

  const flashTimers = new WeakMap();

  function flash(btn, text) {
    const label = $('span', btn);
    if (!label) return;
    if (!flashTimers.has(btn)) btn.dataset.label = label.textContent;
    clearTimeout(flashTimers.get(btn));
    label.textContent = text;
    flashTimers.set(btn, setTimeout(() => {
      label.textContent = btn.dataset.label;
      flashTimers.delete(btn);
    }, 1800));
  }

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const on = (sel) => target.closest(sel);
    let el;

    if ((el = on('[data-open]'))) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // пусть откроется в новой вкладке
      e.preventDefault();
      openProject(el.dataset.open);
    } else if ((el = on('[data-cart]'))) {
      const id = el.dataset.cart;
      if (cart.includes(id)) {
        openCart('list');
      } else if (byId.has(id) && !byId.get(id).sold) {
        setCart(cart.concat(id));
        bumpCount();
        toast(`В корзине: «${byId.get(id).title}»`);
      }
    } else if ((el = on('[data-remove]'))) {
      setCart(cart.filter((id) => id !== el.dataset.remove));
      const heading = $('#cart-title', cartBox);
      if (heading) heading.focus();
    } else if (on('[data-clear]')) {
      setCart([]);
      const heading = $('#cart-title', cartBox);
      if (heading) heading.focus();
    } else if ((el = on('[data-step]'))) {
      const form = $('#order-form', cartBox);
      if (form) readDraft(form);
      goToStep(el.dataset.step);
    } else if (on('[data-finish]')) {
      if (lastOrder && lastOrder.status !== 'sent') setCart([]);
      lastOrder = null;
      cartStep = 'list';
      closeOverlay();
    } else if (on('[data-to-catalog]')) {
      closeOverlay();
      const catalog = $('#catalog');
      if (catalog) catalog.scrollIntoView();
    } else if (on('[data-close]')) {
      closeOverlay();
    } else if (on('#cart-open')) {
      openCart('list');
    } else if ((el = on('[data-cat]'))) {
      state.cat = el.dataset.cat;
      applyFilters();
    } else if (on('[data-reset]')) {
      state.q = '';
      state.cat = '';
      applyFilters();
      searchEl.focus();
    } else if ((el = on('[data-share]'))) {
      copyText(shareUrl(el.dataset.share)).then((ok) => flash(el, ok ? 'Ссылка скопирована' : 'Не удалось скопировать'));
    } else if (on('[data-sent]')) {
      markOrderHandled(); // ссылка откроется сама: это обычный переход в почту или мессенджер
    } else if ((el = on('[data-copy]'))) {
      const source = document.getElementById(el.dataset.copy);
      if (!source) return;
      markOrderHandled();
      copyText(source.value).then((ok) => {
        if (ok) return flash(el, 'Скопировано');
        source.focus();
        source.select();
        flash(el, 'Выделено: скопируйте вручную');
      });
    } else if ((el = on('[data-thumb]'))) {
      /* Большую картинку создаём заново: прежняя могла не загрузиться и смениться обложкой. */
      const frame = $('.pv__cover .cover', projectBox);
      const p = overlay && overlay.view === 'project' ? byId.get(overlay.id) : null;
      if (frame && p) {
        const image = document.createElement('img');
        image.id = 'pv-image';
        image.alt = p.title;
        image.decoding = 'async';
        image.dataset.fallback = p.id;
        image.src = el.dataset.thumb;
        frame.replaceChildren(image);
      }
      $$('.thumb', projectBox).forEach((t) => t.setAttribute('aria-pressed', String(t === el)));
    } else if (on('#theme-toggle')) {
      toggleTheme();
    }
  });

  document.addEventListener('submit', (e) => {
    if (!(e.target instanceof HTMLFormElement) || e.target.id !== 'order-form') return;
    e.preventDefault();
    submitOrder(e.target);
  });

  /* Картинка не загрузилась: показываем нарисованную обложку. */
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const thumb = img.closest('.thumb');
    if (thumb) return thumb.remove();
    const p = byId.get(img.dataset.fallback || '');
    if (p) img.outerHTML = coverSvg(p);
  }, true);

  let searchTimer = 0;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = searchEl.value.trim().slice(0, 80);
      renderGrid();
      writeHistory('replace', historyState(), buildUrl(null));
    }, 140);
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchEl.blur();
  });
  sortEl.addEventListener('change', () => {
    state.sort = Object.prototype.hasOwnProperty.call(SORTS, sortEl.value) ? sortEl.value : 'default';
    applyFilters();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || overlay) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)) return;
    e.preventDefault();
    searchEl.focus();
  });

  [[projectDlg, 'project'], [cartDlg, 'cart']].forEach((pair) => {
    const dlg = pair[0];
    const view = pair[1];
    let pressedBackdrop = false;
    dlg.addEventListener('pointerdown', (e) => { pressedBackdrop = e.target === dlg; });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && pressedBackdrop) closeOverlay();
      pressedBackdrop = false;
    });
    /* Окно закрыли клавишей Esc: приводим историю и состояние в порядок. */
    dlg.addEventListener('close', () => {
      if (overlay && overlay.view === view) closeOverlay();
    });
  });

  window.addEventListener('popstate', () => {
    /* Сетку перерисовываем, только если в адресе изменились фильтры:
       иначе пропал бы фокус с карточки, из которой открывали проект. */
    const before = [state.q, state.cat, state.sort].join('\n');
    readUrl();
    if (before !== [state.q, state.cat, state.sort].join('\n')) {
      syncControls();
      renderGrid();
    }
    overlay = overlayFromLocation();
    if (overlay && overlay.view === 'cart') cartStep = 'list';
    applyOverlay();
  });

  /* Корзину изменили в другой вкладке. */
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_KEY) return;
    cart = loadCart();
    updateCartUi();
  });

  /* ====================================================================
     Запуск
     ==================================================================== */

  readUrl();
  cart = loadCart();
  applyConfig();
  renderStats();
  renderChips();
  syncControls();
  renderGrid();
  updateCartUi();

  const wantedId = new URLSearchParams(location.search).get('project');
  overlay = overlayFromLocation();
  applyOverlay();
  if (wantedId && !byId.has(wantedId)) {
    writeHistory('replace', historyState(), buildUrl(null));
    toast('Такого проекта нет. Возможно, ссылка устарела.');
  } else if (!overlay && (state.q || state.cat) && !location.hash) {
    const catalog = $('#catalog');
    if (catalog) catalog.scrollIntoView();
  }
})();
