/* Тумблер — логика магазина.
   Шапка и подвал общие для всех страниц и строятся из этого файла.
   Корзина, избранное, пользователи и заказы хранятся в localStorage браузера. */
(function () {
  'use strict';

  var SPA = !!window.TUMBLER_SPA; // одностраничная сборка (все страницы в одном файле)
  var PRODUCTS = window.PRODUCTS;
  var CATEGORIES = window.CATEGORIES;
  var byId = {};
  PRODUCTS.forEach(function (p) { byId[p.id] = p; });
  var catById = {};
  CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  var FREE_DELIVERY = 15000;
  var DELIVERY_PRICE = 990;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Утилиты ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var numFmt = new Intl.NumberFormat('ru-RU');
  function fmt(n) { return numFmt.format(n) + ' ₽'; }
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  function items(n) { return n + ' ' + plural(n, ['товар', 'товара', 'товаров']); }
  function fmtDate(iso, withTime) {
    var opts = { day: 'numeric', month: 'long', year: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return new Intl.DateTimeFormat('ru-RU', opts).format(new Date(iso));
  }
  function discount(p) { return p.old ? Math.round((p.old - p.price) / p.old * 100) : 0; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /* Простой хэш пароля (cyrb53). Это учебный пример: настоящая защита
     паролей возможна только на сервере. */
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /* ---------- Иконки ---------- */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    heart: '<path d="M12 20s-7.2-4.4-9.3-9.1A5 5 0 0 1 12 6.1a5 5 0 0 1 9.3 4.8C19.2 15.6 12 20 12 20Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    cart: '<path d="M3 4h2.2l2.3 11h11l2-8H6.3"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2Z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
  };
  function icon(name, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }
  var LOGO = '<svg viewBox="0 0 44 24" aria-hidden="true"><rect class="logo-track" x="1" y="1" width="42" height="22" rx="11"/><circle class="logo-knob" cx="31" cy="12" r="7"/></svg>';
  function art(p) { return window.drawAppliance(p.art, p.color); }

  /* ---------- Хранилище ---------- */
  var mem = {};
  var store = {
    get: function (k, d) {
      if (Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
      var v = d;
      try {
        var raw = localStorage.getItem(k);
        if (raw != null) v = JSON.parse(raw);
      } catch (e) { /* хранилище недоступно — работаем в памяти */ }
      mem[k] = v;
      return v;
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет места или доступа */ }
    }
  };
  var K = {
    cart: 'tumbler.cart', fav: 'tumbler.fav', users: 'tumbler.users',
    session: 'tumbler.session', subs: 'tumbler.subscribers', seeded: 'tumbler.seeded'
  };

  /* ---------- Корзина ---------- */
  var Cart = {
    items: function () { return store.get(K.cart, []).filter(function (i) { return byId[i.id]; }); },
    qty: function (id) { var it = this.items().filter(function (i) { return i.id === id; })[0]; return it ? it.qty : 0; },
    set: function (id, qty) {
      var list = this.items();
      var idx = -1;
      list.forEach(function (x, n) { if (x.id === id) idx = n; });
      qty = Math.min(qty, 99);
      if (qty <= 0) { if (idx > -1) list.splice(idx, 1); }
      else if (idx > -1) list[idx].qty = qty;
      else list.push({ id: id, qty: qty });
      store.set(K.cart, list);
      changed();
    },
    add: function (id, n) { this.set(id, this.qty(id) + (n || 1)); },
    replace: function (list) { store.set(K.cart, list); changed(); },
    count: function () { return this.items().reduce(function (s, i) { return s + i.qty; }, 0); },
    totals: function () {
      var full = 0, sum = 0;
      this.items().forEach(function (i) {
        var p = byId[i.id];
        sum += p.price * i.qty;
        full += (p.old || p.price) * i.qty;
      });
      var delivery = sum === 0 || sum >= FREE_DELIVERY ? 0 : DELIVERY_PRICE;
      return { full: full, sum: sum, discount: full - sum, delivery: delivery, total: sum + delivery };
    }
  };

  /* ---------- Избранное ---------- */
  var Fav = {
    ids: function () { return store.get(K.fav, []).filter(function (id) { return byId[id]; }); },
    has: function (id) { return this.ids().indexOf(id) > -1; },
    toggle: function (id) {
      var list = this.ids();
      var i = list.indexOf(id);
      if (i > -1) list.splice(i, 1); else list.unshift(id);
      store.set(K.fav, list);
      changed();
      return i === -1;
    },
    replace: function (list) { store.set(K.fav, list); changed(); }
  };

  /* ---------- Пользователи ---------- */
  var Auth = {
    users: function () { return store.get(K.users, []); },
    user: function () {
      var id = store.get(K.session, null);
      return id ? this.users().filter(function (u) { return u.id === id; })[0] || null : null;
    },
    byEmail: function (email) {
      email = norm(email);
      return this.users().filter(function (u) { return u.email === email; })[0] || null;
    },
    save: function (u) {
      var list = this.users();
      var i = -1;
      list.forEach(function (x, n) { if (x.id === u.id) i = n; });
      if (i > -1) list[i] = u; else list.push(u);
      store.set(K.users, list);
    },
    checkPass: function (u, pass) { return u.pass === hash(u.id + ':' + pass); },
    setPass: function (u, pass) { u.pass = hash(u.id + ':' + pass); },
    register: function (data) {
      var id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var u = { id: id, name: data.name, phone: data.phone, email: norm(data.email), avatar: null, orders: [], created: new Date().toISOString() };
      this.setPass(u, data.pass);
      this.save(u);
      store.set(K.session, id);
      return u;
    },
    login: function (email, pass) {
      var u = this.byEmail(email);
      if (!u || !this.checkPass(u, pass)) return null;
      store.set(K.session, u.id);
      return u;
    },
    logout: function () { store.set(K.session, null); }
  };

  var STATUS = { 'new': 'Оформлен', shipping: 'В пути', done: 'Доставлен' };

  function makeOrder(no, date, status, list) {
    var orderItems = list.map(function (x) { return { id: x[0], qty: x[1], price: byId[x[0]].price }; });
    var sum = orderItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var delivery = sum >= FREE_DELIVERY ? 0 : DELIVERY_PRICE;
    return { no: no, date: date, status: status, items: orderItems, delivery: delivery, total: sum + delivery };
  }

  /* Демо-аккаунт с историей заказов, чтобы личный кабинет можно было посмотреть сразу */
  function seed() {
    if (store.get(K.seeded, false)) return;
    if (!Auth.byEmail('demo@tumbler.example')) {
      var u = {
        id: 'demo', name: 'Анна Смирнова', phone: '+7 (916) 123-45-67', email: 'demo@tumbler.example',
        avatar: null, created: '2025-03-12T10:00:00.000Z',
        orders: [
          makeOrder('T-251103', '2026-11-03T15:20:00', 'shipping', [['voltis-r5', 1]]),
          makeOrder('T-240917', '2026-10-14T11:05:00', 'done', [['aquaro-wm7140', 1], ['voltis-k17', 2]])
        ]
      };
      Auth.setPass(u, 'demo1234');
      Auth.save(u);
    }
    store.set(K.seeded, true);
  }

  /* ---------- Навигация ---------- */
  var ROUTES = ['home', 'catalog', 'cart', 'favorites', 'login', 'register', 'account'];
  function fileOf(page) { return (page === 'home' ? 'index' : page) + '.html'; }
  function qs(params) {
    var keys = Object.keys(params || {}).filter(function (k) { return params[k] !== '' && params[k] != null; });
    if (!keys.length) return '';
    var sp = new URLSearchParams();
    keys.forEach(function (k) { sp.set(k, params[k]); });
    return '?' + sp.toString();
  }
  function href(page, params) { return fileOf(page) + qs(params); }

  var spaParams = {};
  function go(page, params, opts) {
    params = params || {};
    opts = opts || {};
    if (!SPA) {
      var url = href(page, params);
      if (opts.replace) location.replace(url); else location.href = url;
      return;
    }
    spaParams = params;
    var currentHash = location.hash.slice(1) || 'home';
    if (currentHash === page) { route(); return; }
    if (opts.replace) location.replace('#' + page); else location.hash = page;
  }
  function pageParams() {
    if (SPA) return spaParams;
    var out = {};
    new URLSearchParams(location.search).forEach(function (v, k) { out[k] = v; });
    return out;
  }

  /* ---------- Шапка и подвал ---------- */
  function renderChrome() {
    var header = $('#site-header');
    header.innerHTML =
      '<div class="wrap hdr">' +
        '<a class="logo" href="index.html" aria-label="Тумблер, на главную">' + LOGO + '<span>тумблер</span></a>' +
        '<nav class="hdr-links" aria-label="Разделы">' +
          '<a class="btn btn-primary" href="catalog.html" data-nav="catalog">' + icon('grid') + '<span>Каталог</span></a>' +
          '<a class="hdr-link" href="#contacts">Контакты</a>' +
        '</nav>' +
        '<form class="search" role="search" id="hdr-search" autocomplete="off">' +
          '<label class="visually-hidden" for="hdr-q">Поиск по товарам</label>' +
          '<input id="hdr-q" type="search" placeholder="Холодильник, чайник, Aquaro…" aria-controls="hdr-suggest" aria-expanded="false" aria-autocomplete="list">' +
          '<button type="submit" class="search-btn" aria-label="Найти">' + icon('search') + '</button>' +
          '<div class="suggest" id="hdr-suggest" role="listbox" aria-label="Подсказки" hidden></div>' +
        '</form>' +
        '<nav class="hdr-icons" aria-label="Покупки и профиль">' +
          '<a class="hdr-icon" href="favorites.html" data-nav="favorites">' + icon('heart') + '<span class="hdr-icon-label">Избранное</span><span class="count" data-count="fav" hidden></span></a>' +
          '<a class="hdr-icon" href="account.html" data-nav="account"><span class="hdr-avatar" id="hdr-avatar">' + icon('user') + '</span><span class="hdr-icon-label" id="hdr-account-label">Войти</span></a>' +
          '<a class="hdr-icon" href="cart.html" data-nav="cart">' + icon('cart') + '<span class="hdr-icon-label">Корзина</span><span class="count" data-count="cart" hidden></span></a>' +
        '</nav>' +
      '</div>';

    var footer = $('#site-footer');
    footer.innerHTML =
      '<div class="wrap ftr">' +
        '<div class="ftr-brand">' +
          '<a class="logo" href="index.html" aria-label="Тумблер, на главную">' + LOGO + '<span>тумблер</span></a>' +
          '<p>Крупная и мелкая бытовая техника с доставкой по Москве и области. Привезём, поднимем на этаж и подключим.</p>' +
        '</div>' +
        '<nav aria-label="Покупателям"><h2>Покупателям</h2><ul>' +
          '<li><a href="catalog.html">Каталог</a></li>' +
          '<li><a href="favorites.html">Избранное</a></li>' +
          '<li><a href="cart.html">Корзина</a></li>' +
          '<li><a href="account.html">Личный кабинет</a></li>' +
        '</ul></nav>' +
        '<nav aria-label="Категории"><h2>Категории</h2><ul>' +
          CATEGORIES.slice(0, 5).map(function (c) { return '<li><a href="' + href('catalog', { cat: c.id }) + '">' + esc(c.name) + '</a></li>'; }).join('') +
        '</ul></nav>' +
        '<div class="ftr-contacts" id="contacts"><h2>Контакты</h2>' +
          '<p class="ftr-phone"><a href="tel:+78000001427">8 800 000-14-27</a></p>' +
          '<p>Ежедневно с 9:00 до 21:00, звонок бесплатный</p>' +
          '<p><a href="mailto:info@tumbler.example">info@tumbler.example</a></p>' +
          '<p>Москва, ул. Электрозаводская, 21, шоурум на 2-м этаже</p>' +
        '</div>' +
      '</div>' +
      '<div class="wrap ftr-bottom"><span>© 2026 Тумблер</span><span>Учебный проект: товары, бренды и цены вымышлены</span></div>';

    if (!$('#toasts')) {
      var t = document.createElement('div');
      t.id = 'toasts';
      t.className = 'toasts';
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    bindSearch();
  }

  function setActive(page) {
    var nav = page === 'login' || page === 'register' ? 'account' : page;
    $$('#site-header [data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function updateChrome() {
    var c = Cart.count(), f = Fav.ids().length, u = Auth.user();
    var cc = $('[data-count="cart"]');
    if (cc) { cc.textContent = c > 99 ? '99+' : c; cc.hidden = !c; }
    var fc = $('[data-count="fav"]');
    if (fc) { fc.textContent = f; fc.hidden = !f; }
    var label = $('#hdr-account-label');
    if (label) label.textContent = u ? 'Кабинет' : 'Войти';
    var av = $('#hdr-avatar');
    if (av) av.innerHTML = u && u.avatar ? '<img src="' + u.avatar + '" alt="">' : icon('user');
  }

  /* ---------- Поиск ---------- */
  function matchQuery(p, q) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    var hay = norm([p.name, p.kind, p.brand, catById[p.cat].name, p.specs.join(' ')].join(' '));
    return words.every(function (w) { return hay.indexOf(w) > -1; });
  }

  function bindSearch() {
    var form = $('#hdr-search'), input = $('#hdr-q'), box = $('#hdr-suggest');
    function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      var found = PRODUCTS.filter(function (p) { return matchQuery(p, q); });
      box.innerHTML = found.length
        ? found.slice(0, 6).map(function (p) {
            return '<a class="sug" role="option" href="' + esc(href('catalog', { q: p.name })) + '">' +
              '<span class="sug-art">' + art(p) + '</span>' +
              '<span class="sug-text"><span class="sug-name">' + esc(p.name) + '</span><span class="sug-kind">' + esc(p.kind) + '</span></span>' +
              '<span class="sug-price">' + fmt(p.price) + '</span></a>';
          }).join('') +
          '<a class="sug-all" href="' + esc(href('catalog', { q: q })) + '">Показать все: ' + items(found.length) + '</a>'
        : '<p class="sug-empty">По запросу «' + esc(q) + '» ничего не нашлось. Попробуйте «холодильник» или «пылесос».</p>';
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      close();
      var q = input.value.trim();
      go('catalog', q ? { q: q } : {});
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' && !box.hidden) {
        var first = box.querySelector('a');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    box.addEventListener('keydown', function (e) {
      var links = $$('a', box);
      var i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (links[i + 1]) links[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else links[i - 1].focus(); }
      if (e.key === 'Escape') { close(); input.focus(); }
    });
    box.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
  }

  /* ---------- Уведомления ---------- */
  function toast(msg, action) {
    var box = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.label) + '</button>' : '');
    if (action) {
      el.querySelector('button').addEventListener('click', function () { action.fn(); el.remove(); });
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(function () { el.remove(); }, action ? 5000 : 3000);
  }

  /* ---------- Карточка товара ---------- */
  function energyHTML(cls) {
    return '<span class="energy energy-' + cls + '" title="Класс энергопотребления ' + cls + '"><span class="visually-hidden">Класс энергопотребления </span>' + cls + '</span>';
  }
  function stepperHTML(id, q, min) {
    min = min || 0;
    return '<div class="stepper" role="group" aria-label="Количество">' +
      '<button type="button" data-action="dec" data-id="' + id + '" aria-label="Уменьшить количество"' + (q <= min ? ' disabled' : '') + '>' + icon('minus') + '</button>' +
      '<output>' + q + '</output>' +
      '<button type="button" data-action="inc" data-id="' + id + '" aria-label="Увеличить количество"' + (q >= 99 ? ' disabled' : '') + '>' + icon('plus') + '</button>' +
    '</div>';
  }
  function ctaHTML(p) {
    if (p.stock === false) return '<button type="button" class="btn btn-ghost btn-block" disabled>Нет в наличии</button>';
    var q = Cart.qty(p.id);
    if (!q) return '<button type="button" class="btn btn-primary btn-block" data-action="add" data-id="' + p.id + '">' + icon('cart') + 'В корзину</button>';
    return '<div class="in-cart">' + stepperHTML(p.id, q) +
      '<a class="btn btn-ghost in-cart-link" href="cart.html" aria-label="Товар в корзине, перейти в корзину" title="Перейти в корзину">' + icon('check') + '</a></div>';
  }
  function favAttrs(id) {
    var on = Fav.has(id);
    return 'aria-pressed="' + on + '" aria-label="' + (on ? 'Убрать из избранного' : 'Добавить в избранное') + '"';
  }
  function cardHTML(p) {
    var d = discount(p);
    return '<article class="card" data-id="' + p.id + '">' +
      '<div class="card-media">' + art(p) +
        '<div class="card-flags">' +
          (p.isNew ? '<span class="flag flag-new">Новинка</span>' : '') +
          (d ? '<span class="flag flag-sale">−' + d + '%</span>' : '') +
        '</div>' +
        '<button type="button" class="fav-btn" data-action="fav" data-id="' + p.id + '" ' + favAttrs(p.id) + '>' + icon('heart') + '</button>' +
        (p.energy ? energyHTML(p.energy) : '') +
      '</div>' +
      '<div class="card-body">' +
        '<p class="card-kind">' + esc(p.kind) + '</p>' +
        '<h3 class="card-title">' + esc(p.name) + '</h3>' +
        '<ul class="card-specs">' + p.specs.slice(0, 3).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<p class="card-rating">' + icon('star', 'star') + '<b>' + p.rating.toFixed(1).replace('.', ',') + '</b><span>' + p.reviews + ' ' + plural(p.reviews, ['отзыв', 'отзыва', 'отзывов']) + '</span></p>' +
        '<div class="card-price"><span class="price">' + fmt(p.price) + '</span>' + (p.old ? '<s class="old">' + fmt(p.old) + '</s>' : '') + '</div>' +
        '<div class="card-cta">' + ctaHTML(p) + '</div>' +
      '</div>' +
    '</article>';
  }
  function refreshCards() {
    $$('.card[data-id]').forEach(function (card) {
      var p = byId[card.getAttribute('data-id')];
      var on = Fav.has(p.id);
      var fb = card.querySelector('.fav-btn');
      fb.setAttribute('aria-pressed', on);
      fb.setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное');
      card.querySelector('.card-cta').innerHTML = ctaHTML(p);
    });
  }

  /* ---------- Состояние страницы ---------- */
  var current = { page: null, refresh: null };
  var bound = {};
  function changed() {
    updateChrome();
    if (current.refresh) current.refresh();
    refreshCards();
  }

  /* ---------- Общие обработчики ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (a) {
      var raw = a.getAttribute('href');
      if (raw === '#contacts') {
        e.preventDefault();
        var c = $('#contacts');
        if (c) c.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
        return;
      }
      if (SPA) {
        var m = raw.match(/^(index|catalog|cart|favorites|login|register|account)\.html(?:\?([^#]*))?$/);
        if (m) {
          e.preventDefault();
          var params = {};
          new URLSearchParams(m[2] || '').forEach(function (v, k) { params[k] = v; });
          go(m[1] === 'index' ? 'home' : m[1], params);
          return;
        }
      }
    }

    var t = e.target.closest('[data-toggle-pass]');
    if (t) {
      var input = document.getElementById(t.getAttribute('data-toggle-pass'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.setAttribute('aria-pressed', show);
      t.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    var scope = btn.closest('main') || document;
    var hadFocus = document.activeElement === btn;
    var p = byId[id];

    if (act === 'add') {
      Cart.add(id, 1);
      toast('«' + p.name + '» в корзине', { label: 'Оформить', fn: function () { go('cart'); } });
    } else if (act === 'inc') {
      Cart.add(id, 1);
    } else if (act === 'dec') {
      Cart.add(id, -1);
    } else if (act === 'remove') {
      var q = Cart.qty(id);
      var snapshot = Cart.items().map(function (i) { return { id: i.id, qty: i.qty }; });
      Cart.set(id, 0);
      toast('«' + p.name + '» удалён из корзины', { label: 'Вернуть', fn: function () { if (q) Cart.replace(snapshot); } });
    } else if (act === 'fav') {
      var on = Fav.toggle(id);
      toast(on ? 'Добавлено в избранное' : 'Удалено из избранного');
    } else if (act === 'repeat') {
      repeatOrder(id);
    } else {
      return;
    }

    if (hadFocus && id) {
      var order = act === 'add' ? ['inc', 'add'] : act === 'dec' ? ['dec', 'add', 'inc'] : [act, 'add'];
      for (var n = 0; n < order.length; n++) {
        var next = scope.querySelector('[data-action="' + order[n] + '"][data-id="' + id + '"]:not([disabled])');
        if (next) { next.focus(); break; }
      }
    }
  });

  function setErr(input, msg) {
    var field = input.closest('.field');
    if (field) {
      field.classList.toggle('has-error', !!msg);
      var err = field.querySelector('.field-error');
      if (err) err.textContent = msg || '';
    }
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    return !msg;
  }
  function clearErrors(root) {
    $$('[aria-invalid]', root).forEach(function (i) { setErr(i, ''); });
  }
  function focusFirstError(root) {
    var bad = root.querySelector('[aria-invalid="true"]');
    if (bad) bad.focus();
  }
  function formatPhone(v) {
    var d = String(v).replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length > 4) out += ') ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }
  function phoneOk(v) { return String(v).replace(/\D/g, '').length === 11; }
  function bindPhone(input) {
    input.addEventListener('input', function () { input.value = formatPhone(input.value); });
  }
  function nameOk(v) { return v.trim().split(/\s+/).filter(function (w) { return w.length > 1; }).length >= 2; }
  function passProblem(v) {
    if (v.length < 8) return 'Пароль должен быть не короче 8 символов';
    if (!/[a-zа-яё]/i.test(v) || !/\d/.test(v)) return 'Добавьте в пароль хотя бы одну букву и одну цифру';
    return '';
  }

  /* ---------- Главная ---------- */
  function initHome() {
    if (!bound.home) {
      initCarousel();
      bindSubscribe();
      bound.home = true;
    }
    $('#home-cats').innerHTML = CATEGORIES.map(function (c) {
      var n = PRODUCTS.filter(function (p) { return p.cat === c.id; }).length;
      return '<a class="cat-tile" href="' + href('catalog', { cat: c.id }) + '">' +
        '<span class="cat-art">' + window.drawAppliance(c.art, 'white') + '</span>' +
        '<span class="cat-name">' + esc(c.name) + '</span>' +
        '<span class="cat-count">' + items(n) + '</span></a>';
    }).join('');
    var top = PRODUCTS.filter(function (p) { return p.stock !== false; })
      .sort(function (a, b) { return b.pop - a.pop; }).slice(0, 8);
    $('#home-popular').innerHTML = top.map(cardHTML).join('');
  }

  function initCarousel() {
    var root = $('[data-carousel]');
    if (!root) return;
    var track = $('.slides', root);
    var slides = $$('.slide', root);
    var dotsBox = $('.dots', root);
    var counter = $('.hero-counter', root);
    var i = 0, timer = null;

    $$('[data-art]', root).forEach(function (el) {
      el.innerHTML = window.drawAppliance(el.getAttribute('data-art'), el.getAttribute('data-color'));
    });
    dotsBox.innerHTML = slides.map(function (s, n) {
      return '<button type="button" class="dot" aria-label="Слайд ' + (n + 1) + ' из ' + slides.length + '"></button>';
    }).join('');
    var dots = $$('.dot', dotsBox);

    function show(n) {
      i = (n + slides.length) % slides.length;
      track.style.transform = 'translateX(' + (-i * 100) + '%)';
      slides.forEach(function (s, k) {
        s.setAttribute('aria-hidden', k !== i);
        if (k !== i) s.setAttribute('inert', ''); else s.removeAttribute('inert');
      });
      dots.forEach(function (d, k) { d.setAttribute('aria-current', k === i); });
      counter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    }
    function stop() { clearInterval(timer); timer = null; }
    function play() { stop(); if (!reducedMotion) timer = setInterval(function () { show(i + 1); }, 6000); }

    $('[data-dir="prev"]', root).addEventListener('click', function () { show(i - 1); play(); });
    $('[data-dir="next"]', root).addEventListener('click', function () { show(i + 1); play(); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); play(); }); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', play);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) play(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else play(); });

    var x0 = null;
    var vp = $('.hero-viewport', root);
    vp.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) { show(dx < 0 ? i + 1 : i - 1); play(); }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { show(i - 1); }
      if (e.key === 'ArrowRight') { show(i + 1); }
    });

    show(0);
    play();
  }

  function bindSubscribe() {
    var form = $('#sub-form');
    if (!form) return;
    var name = $('#sub-name'), email = $('#sub-email'), agree = $('#sub-agree'), status = $('#sub-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      var ok = setErr(name, name.value.trim().length >= 2 ? '' : 'Введите имя');
      ok = setErr(email, EMAIL_RE.test(email.value.trim()) ? '' : 'Проверьте адрес, например: ivan@mail.ru') && ok;
      ok = setErr(agree, agree.checked ? '' : 'Отметьте согласие, чтобы мы могли присылать письма') && ok;
      if (!ok) { focusFirstError(form); return; }
      var em = norm(email.value);
      var subs = store.get(K.subs, []);
      var exists = subs.some(function (s) { return s.email === em; });
      if (!exists) {
        subs.push({ name: name.value.trim(), email: em, date: new Date().toISOString() });
        store.set(K.subs, subs);
      }
      status.textContent = exists
        ? 'Адрес ' + em + ' уже подписан на акции.'
        : name.value.trim() + ', готово! Адрес ' + em + ' добавлен в рассылку акций.';
      form.reset();
    });
  }

  /* ---------- Каталог ---------- */
  var SORTS = {
    pop: function (a, b) { return b.pop - a.pop; },
    cheap: function (a, b) { return a.price - b.price; },
    expensive: function (a, b) { return b.price - a.price; },
    rating: function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; },
    discount: function (a, b) { return discount(b) - discount(a) || b.pop - a.pop; }
  };
  var C = { q: '', cats: [], brands: [], energy: [], min: '', max: '', stock: false, sale: false, sort: 'pop' };
  var activeChips = [];

  function resetCatalog() {
    C.q = ''; C.cats = []; C.brands = []; C.energy = []; C.min = ''; C.max = '';
    C.stock = false; C.sale = false; C.sort = 'pop';
  }
  function toggleIn(list, v) {
    var i = list.indexOf(v);
    if (i > -1) list.splice(i, 1); else list.push(v);
  }

  function buildFilters() {
    var count = function (fn) { return PRODUCTS.filter(fn).length; };
    $('#cat-f-cats').innerHTML = CATEGORIES.map(function (c) {
      return '<label class="check"><input type="checkbox" id="cat-c-' + c.id + '" data-filter="cats" value="' + c.id + '"><span>' + esc(c.name) + '</span><span class="check-count">' + count(function (p) { return p.cat === c.id; }) + '</span></label>';
    }).join('');
    var brands = PRODUCTS.map(function (p) { return p.brand; }).filter(function (b, i, arr) { return arr.indexOf(b) === i; }).sort();
    $('#cat-f-brands').innerHTML = brands.map(function (b) {
      return '<label class="check"><input type="checkbox" id="cat-b-' + b.toLowerCase() + '" data-filter="brands" value="' + esc(b) + '"><span>' + esc(b) + '</span><span class="check-count">' + count(function (p) { return p.brand === b; }) + '</span></label>';
    }).join('');
    var classes = 'ABCDEFG'.split('').filter(function (e) { return PRODUCTS.some(function (p) { return p.energy === e; }); });
    $('#cat-f-energy').innerHTML = classes.map(function (e) {
      return '<button type="button" class="energy-' + e + '" data-energy="' + e + '" aria-pressed="false" aria-label="Класс ' + e + '">' + e + '</button>';
    }).join('');
    var prices = PRODUCTS.map(function (p) { return p.price; });
    $('#cat-min').placeholder = 'от ' + numFmt.format(Math.min.apply(null, prices));
    $('#cat-max').placeholder = 'до ' + numFmt.format(Math.max.apply(null, prices));
  }

  function bindCatalog() {
    var filters = $('#cat-filters');
    filters.addEventListener('change', function (e) {
      var t = e.target;
      var f = t.getAttribute('data-filter');
      if (f) toggleIn(C[f], t.value);
      if (t.id === 'cat-stock') C.stock = t.checked;
      if (t.id === 'cat-sale') C.sale = t.checked;
      renderCatalog();
    });
    $('#cat-f-energy').addEventListener('click', function (e) {
      var b = e.target.closest('[data-energy]');
      if (!b) return;
      toggleIn(C.energy, b.getAttribute('data-energy'));
      syncCatalogUI();
      renderCatalog();
    });
    var onPrice = debounce(function () {
      C.min = $('#cat-min').value;
      C.max = $('#cat-max').value;
      renderCatalog();
    }, 300);
    $('#cat-min').addEventListener('input', onPrice);
    $('#cat-max').addEventListener('input', onPrice);
    $('#cat-reset').addEventListener('click', function () {
      var sort = C.sort;
      resetCatalog();
      C.sort = sort;
      $('#hdr-q').value = '';
      syncCatalogUI();
      renderCatalog();
    });
    $$('[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        C.sort = b.getAttribute('data-sort');
        syncCatalogUI();
        renderCatalog();
      });
    });
    var toggle = $('#cat-filters-toggle');
    toggle.addEventListener('click', function () {
      var open = !filters.classList.contains('is-open');
      filters.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open);
    });
    $('#cat-active').addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip]');
      if (!b) return;
      activeChips[+b.getAttribute('data-chip')].clear();
      syncCatalogUI();
      renderCatalog();
    });
    $('#cat-empty-reset').addEventListener('click', function () { $('#cat-reset').click(); });
  }

  function syncCatalogUI() {
    $$('#cat-filters [data-filter]').forEach(function (i) { i.checked = C[i.getAttribute('data-filter')].indexOf(i.value) > -1; });
    $$('#cat-f-energy [data-energy]').forEach(function (b) { b.setAttribute('aria-pressed', C.energy.indexOf(b.getAttribute('data-energy')) > -1); });
    $('#cat-min').value = C.min;
    $('#cat-max').value = C.max;
    $('#cat-stock').checked = C.stock;
    $('#cat-sale').checked = C.sale;
    $$('[data-sort]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-sort') === C.sort); });
  }

  function filteredProducts() {
    var min = parseInt(C.min, 10), max = parseInt(C.max, 10);
    return PRODUCTS.filter(function (p) {
      if (C.q && !matchQuery(p, C.q)) return false;
      if (C.cats.length && C.cats.indexOf(p.cat) === -1) return false;
      if (C.brands.length && C.brands.indexOf(p.brand) === -1) return false;
      if (C.energy.length && C.energy.indexOf(p.energy) === -1) return false;
      if (!isNaN(min) && p.price < min) return false;
      if (!isNaN(max) && p.price > max) return false;
      if (C.stock && p.stock === false) return false;
      if (C.sale && !p.old) return false;
      return true;
    }).sort(SORTS[C.sort]);
  }

  function renderCatalog() {
    var list = filteredProducts();
    $('#cat-grid').innerHTML = list.map(cardHTML).join('');
    $('#cat-grid').hidden = !list.length;
    $('#cat-empty').hidden = !!list.length;
    $('#cat-count').textContent = items(list.length);
    $('#cat-title').textContent = C.cats.length === 1 ? catById[C.cats[0]].name : (C.q ? 'Результаты поиска' : 'Каталог');

    activeChips = [];
    if (C.q) activeChips.push({ label: 'Поиск: «' + C.q + '»', clear: function () { C.q = ''; $('#hdr-q').value = ''; } });
    C.cats.forEach(function (id) { activeChips.push({ label: catById[id].name, clear: function () { toggleIn(C.cats, id); } }); });
    C.brands.forEach(function (b) { activeChips.push({ label: b, clear: function () { toggleIn(C.brands, b); } }); });
    C.energy.forEach(function (e) { activeChips.push({ label: 'Класс ' + e, clear: function () { toggleIn(C.energy, e); } }); });
    if (C.min || C.max) {
      activeChips.push({
        label: 'Цена: ' + (C.min ? 'от ' + numFmt.format(C.min) + ' ' : '') + (C.max ? 'до ' + numFmt.format(C.max) : '') + ' ₽',
        clear: function () { C.min = ''; C.max = ''; }
      });
    }
    if (C.stock) activeChips.push({ label: 'В наличии', clear: function () { C.stock = false; } });
    if (C.sale) activeChips.push({ label: 'Со скидкой', clear: function () { C.sale = false; } });
    $('#cat-active').innerHTML = activeChips.map(function (c, n) {
      return '<button type="button" class="chip" data-chip="' + n + '" aria-label="Убрать фильтр: ' + esc(c.label) + '">' + esc(c.label) + icon('close') + '</button>';
    }).join('');
    var badge = $('#cat-active-count');
    badge.textContent = activeChips.length;
    badge.hidden = !activeChips.length;
  }

  function initCatalog(params) {
    if (!bound.catalog) {
      buildFilters();
      bindCatalog();
      bound.catalog = true;
    }
    resetCatalog();
    if (params.cat && catById[params.cat]) C.cats.push(params.cat);
    if (params.q) C.q = String(params.q).trim();
    if (params.sale) C.sale = true;
    if (params.sort && SORTS[params.sort]) C.sort = params.sort;
    $('#hdr-q').value = C.q;
    syncCatalogUI();
    renderCatalog();
  }

  /* ---------- Корзина ---------- */
  function lineHTML(i) {
    var p = byId[i.id];
    var on = Fav.has(p.id);
    return '<article class="line" data-id="' + p.id + '">' +
      '<div class="line-media">' + art(p) + '</div>' +
      '<div class="line-info">' +
        '<p class="line-kind">' + esc(p.kind) + ' · ' + esc(p.brand) + '</p>' +
        '<h3 class="line-title">' + esc(p.name) + '</h3>' +
        '<p class="line-specs">' + p.specs.slice(0, 3).map(esc).join(' · ') + '</p>' +
        '<div class="line-actions">' +
          '<button type="button" class="link-btn" data-action="fav" data-id="' + p.id + '" aria-pressed="' + on + '">' + icon('heart') + (on ? 'В избранном' : 'В избранное') + '</button>' +
          '<button type="button" class="link-btn" data-action="remove" data-id="' + p.id + '">' + icon('trash') + 'Удалить</button>' +
        '</div>' +
      '</div>' +
      '<div class="line-qty">' + stepperHTML(p.id, i.qty, 1) + '</div>' +
      '<div class="line-price"><b class="price">' + fmt(p.price * i.qty) + '</b>' +
        (i.qty > 1 ? '<span>' + fmt(p.price) + ' за шт.</span>' : '') +
        (p.old ? '<s class="old">' + fmt(p.old * i.qty) + '</s>' : '') +
      '</div>' +
    '</article>';
  }

  function renderCart() {
    var list = Cart.items();
    var empty = !list.length;
    var done = !$('#cart-done').hidden;
    $('#cart-layout').hidden = empty;
    $('#cart-empty').hidden = !empty || done;
    $('#cart-meta').textContent = empty ? '' : items(Cart.count());
    if (empty) return;

    $('#cart-list').innerHTML = list.map(lineHTML).join('');
    var t = Cart.totals();
    $('#cart-rows').innerHTML =
      '<div><dt>Товары, ' + Cart.count() + ' шт.</dt><dd>' + fmt(t.full) + '</dd></div>' +
      (t.discount ? '<div class="sum-discount"><dt>Скидка</dt><dd>−' + fmt(t.discount) + '</dd></div>' : '') +
      '<div><dt>Доставка</dt><dd>' + (t.delivery ? fmt(t.delivery) : 'Бесплатно') + '</dd></div>';
    $('#cart-total').textContent = fmt(t.total);
    $('#cart-hint').textContent = t.delivery
      ? 'Добавьте товаров ещё на ' + fmt(FREE_DELIVERY - t.sum) + ', и доставка будет бесплатной.'
      : 'Доставим по Москве за 1–2 дня. Курьер позвонит за час до приезда.';
    $('#cart-checkout').textContent = Auth.user() ? 'Оформить заказ' : 'Войти и оформить заказ';
  }

  function checkout() {
    var u = Auth.user();
    if (!u) {
      toast('Войдите или зарегистрируйтесь, чтобы оформить заказ');
      go('login', { next: 'cart' });
      return;
    }
    var list = Cart.items();
    if (!list.length) return;
    var t = Cart.totals();
    var order = {
      no: 'T-' + String(Math.floor(100000 + Math.random() * 900000)),
      date: new Date().toISOString(),
      status: 'new',
      items: list.map(function (i) { return { id: i.id, qty: i.qty, price: byId[i.id].price }; }),
      delivery: t.delivery,
      total: t.total
    };
    u.orders = [order].concat(u.orders || []);
    Auth.save(u);
    var box = $('#cart-done');
    box.innerHTML = icon('check') + '<p><b>Заказ № ' + order.no + ' оформлен на ' + fmt(order.total) + '.</b> ' +
      'Менеджер позвонит на ' + esc(u.phone || 'ваш номер') + ', чтобы согласовать время доставки. ' +
      'Состав и статус заказа — в <a href="account.html">личном кабинете</a>.</p>';
    box.hidden = false;
    Cart.replace([]);
    window.scrollTo(0, 0);
  }

  function initCart() {
    if (!bound.cart) {
      $('#cart-checkout').addEventListener('click', checkout);
      $('#cart-clear').addEventListener('click', function () {
        var snapshot = Cart.items().map(function (i) { return { id: i.id, qty: i.qty }; });
        Cart.replace([]);
        toast('Корзина очищена', { label: 'Вернуть', fn: function () { Cart.replace(snapshot); } });
      });
      bound.cart = true;
    }
    $('#cart-done').hidden = true;
    current.refresh = renderCart;
    renderCart();
  }

  /* ---------- Избранное ---------- */
  function renderFavorites() {
    var ids = Fav.ids();
    $('#fav-grid').innerHTML = ids.map(function (id) { return cardHTML(byId[id]); }).join('');
    $('#fav-grid').hidden = !ids.length;
    $('#fav-empty').hidden = !!ids.length;
    $('#fav-actions').hidden = !ids.length;
    $('#fav-meta').textContent = ids.length ? items(ids.length) : '';
    var addable = ids.filter(function (id) { return byId[id].stock !== false && !Cart.qty(id); });
    $('#fav-all').disabled = !addable.length;
  }
  function initFavorites() {
    if (!bound.favorites) {
      $('#fav-all').addEventListener('click', function () {
        var list = Cart.items();
        var added = 0;
        Fav.ids().forEach(function (id) {
          if (byId[id].stock === false || Cart.qty(id)) return;
          list.push({ id: id, qty: 1 });
          added++;
        });
        if (!added) return;
        Cart.replace(list);
        toast('В корзину добавлено: ' + items(added), { label: 'Оформить', fn: function () { go('cart'); } });
      });
      $('#fav-clear').addEventListener('click', function () {
        var snapshot = Fav.ids().slice();
        Fav.replace([]);
        toast('Избранное очищено', { label: 'Вернуть', fn: function () { Fav.replace(snapshot); } });
      });
      bound.favorites = true;
    }
    current.refresh = renderFavorites;
    renderFavorites();
  }

  /* ---------- Вход ---------- */
  var loginNext = 'account';
  function safeNext(n) { return ROUTES.indexOf(n) > -1 && n !== 'login' && n !== 'register' ? n : 'account'; }

  function initLogin(params) {
    if (Auth.user()) { go('account', {}, { replace: true }); return; }
    loginNext = safeNext(params.next);
    $('#login-to-register').setAttribute('href', href('register', loginNext !== 'account' ? { next: loginNext } : {}));
    var form = $('#login-form');
    if (!bound.login) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = $('#login-email'), pass = $('#login-pass'), err = $('#login-error');
        err.hidden = true;
        var ok = setErr(email, EMAIL_RE.test(email.value.trim()) ? '' : 'Введите почту, которую указывали при регистрации');
        ok = setErr(pass, pass.value ? '' : 'Введите пароль') && ok;
        if (!ok) { focusFirstError(form); return; }
        var u = Auth.login(email.value, pass.value);
        if (!u) {
          err.textContent = 'Почта или пароль не подходят. Проверьте раскладку и Caps Lock или зарегистрируйтесь.';
          err.hidden = false;
          pass.focus();
          return;
        }
        form.reset();
        updateChrome();
        toast('Здравствуйте, ' + u.name.split(' ').slice(-1)[0] + '!');
        go(loginNext);
      });
      $('#login-demo').addEventListener('click', function () {
        $('#login-email').value = 'demo@tumbler.example';
        $('#login-pass').value = 'demo1234';
        clearErrors(form);
        $('#login-error').hidden = true;
        form.querySelector('[type="submit"]').focus();
      });
      bound.login = true;
    }
    clearErrors(form);
    $('#login-error').hidden = true;
  }

  /* ---------- Регистрация ---------- */
  var registerNext = 'account';
  function strength(v) {
    if (!v) return 0;
    var s = 0;
    if (v.length >= 8) s++;
    if (/[a-zа-яё]/i.test(v) && /\d/.test(v)) s++;
    if (/[a-zа-яё]/.test(v) && /[A-ZА-ЯЁ]/.test(v)) s++;
    if (/[^0-9a-zа-яё]/i.test(v) || v.length >= 12) s++;
    return Math.max(1, s);
  }
  var STRENGTH_LABEL = ['', 'Слабый пароль', 'Средний пароль', 'Хороший пароль', 'Надёжный пароль'];

  function initRegister(params) {
    if (Auth.user()) { go('account', {}, { replace: true }); return; }
    registerNext = safeNext(params.next);
    $('#reg-to-login').setAttribute('href', href('login', registerNext !== 'account' ? { next: registerNext } : {}));
    var form = $('#reg-form');
    if (!bound.register) {
      bindPhone($('#reg-phone'));
      $('#reg-pass').addEventListener('input', function () {
        var v = $('#reg-pass').value, m = $('#reg-meter');
        m.hidden = !v;
        m.setAttribute('data-level', strength(v));
        $('#reg-meter-label').textContent = STRENGTH_LABEL[strength(v)];
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = $('#reg-name'), phone = $('#reg-phone'), email = $('#reg-email'),
            pass = $('#reg-pass'), pass2 = $('#reg-pass2'), agree = $('#reg-agree');
        var ok = setErr(name, nameOk(name.value) ? '' : 'Укажите фамилию и имя, например: Иванова Мария');
        ok = setErr(phone, phoneOk(phone.value) ? '' : 'Введите номер полностью: +7 (999) 123-45-67') && ok;
        var emailMsg = !EMAIL_RE.test(email.value.trim()) ? 'Проверьте адрес, например: ivan@mail.ru'
          : Auth.byEmail(email.value) ? 'Эта почта уже зарегистрирована. Войдите в аккаунт' : '';
        ok = setErr(email, emailMsg) && ok;
        ok = setErr(pass, passProblem(pass.value)) && ok;
        ok = setErr(pass2, pass2.value && pass2.value === pass.value ? '' : 'Пароли не совпадают') && ok;
        ok = setErr(agree, agree.checked ? '' : 'Нужно согласие на обработку персональных данных') && ok;
        if (!ok) { focusFirstError(form); return; }
        var u = Auth.register({ name: name.value.trim().replace(/\s+/g, ' '), phone: phone.value, email: email.value, pass: pass.value });
        form.reset();
        $('#reg-meter').hidden = true;
        updateChrome();
        toast('Аккаунт создан. Добро пожаловать, ' + u.name.split(' ').slice(-1)[0] + '!');
        go(registerNext);
      });
      bound.register = true;
    }
    clearErrors(form);
  }

  /* ---------- Личный кабинет ---------- */
  function renderAvatar(u) {
    $('#acc-avatar').innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="Фото профиля">' : esc(initials(u.name));
    $('#acc-photo-remove').hidden = !u.avatar;
  }
  function orderHTML(o) {
    var n = o.items.reduce(function (s, i) { return s + i.qty; }, 0);
    return '<article class="order">' +
      '<header class="order-head"><div><h3 class="order-no">Заказ № ' + esc(o.no) + '</h3>' +
        '<p class="order-date">' + fmtDate(o.date, true) + ' · ' + items(n) + '</p></div>' +
        '<span class="status status-' + o.status + '">' + STATUS[o.status] + '</span></header>' +
      '<ul class="order-items">' + o.items.map(function (i) {
        var p = byId[i.id];
        if (!p) return '';
        return '<li><span class="order-thumb">' + art(p) + '</span><span class="order-name">' + esc(p.name) + '</span>' +
          '<span class="order-qty">' + i.qty + ' × ' + fmt(i.price) + '</span></li>';
      }).join('') + '</ul>' +
      '<footer class="order-foot"><span>Доставка: ' + (o.delivery ? fmt(o.delivery) : 'бесплатно') + '</span>' +
        '<b class="order-total">' + fmt(o.total) + '</b>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="repeat" data-id="' + esc(o.no) + '">Повторить заказ</button></footer>' +
    '</article>';
  }
  function repeatOrder(no) {
    var u = Auth.user();
    if (!u) return;
    var o = (u.orders || []).filter(function (x) { return x.no === no; })[0];
    if (!o) return;
    var list = Cart.items();
    var added = 0;
    o.items.forEach(function (i) {
      var p = byId[i.id];
      if (!p || p.stock === false) return;
      var ex = list.filter(function (x) { return x.id === i.id; })[0];
      if (ex) ex.qty = Math.min(99, ex.qty + i.qty); else list.push({ id: i.id, qty: i.qty });
      added += i.qty;
    });
    if (!added) { toast('Этих товаров сейчас нет в наличии'); return; }
    Cart.replace(list);
    toast('Товары из заказа № ' + no + ' в корзине', { label: 'Оформить', fn: function () { go('cart'); } });
  }
  function renderAccount() {
    var u = Auth.user();
    if (!u) return;
    renderAvatar(u);
    $('#acc-name-view').textContent = u.name;
    $('#acc-since').textContent = 'Аккаунт создан ' + fmtDate(u.created);
    var orders = u.orders || [];
    $('#acc-stat-orders').textContent = orders.length;
    $('#acc-stat-sum').textContent = fmt(orders.reduce(function (s, o) { return s + o.total; }, 0));
    $('#acc-orders').innerHTML = orders.length
      ? orders.map(orderHTML).join('')
      : '<div class="empty"><div class="empty-icon">' + icon('cart') + '</div><h2>Заказов пока нет</h2>' +
        '<p>Здесь появятся покупки, их состав и статус доставки.</p><a class="btn btn-primary" href="catalog.html">Перейти в каталог</a></div>';
  }

  function initAccount() {
    var u = Auth.user();
    if (!u) { go('login', { next: 'account' }, { replace: true }); return; }
    if (!bound.account) {
      bindPhone($('#acc-phone'));
      $('#acc-photo-btn').addEventListener('click', function () { $('#acc-photo').click(); });
      $('#acc-photo').addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!/^image\//.test(file.type)) { toast('Выберите изображение в формате JPG, PNG или WebP'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var size = 240, cv = document.createElement('canvas');
            cv.width = cv.height = size;
            var m = Math.min(img.width, img.height);
            cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
            var user = Auth.user();
            user.avatar = cv.toDataURL('image/jpeg', 0.85);
            Auth.save(user);
            renderAvatar(user);
            updateChrome();
            toast('Фото профиля обновлено');
          };
          img.onerror = function () { toast('Не получилось открыть файл. Попробуйте другое изображение'); };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
      $('#acc-photo-remove').addEventListener('click', function () {
        var user = Auth.user();
        user.avatar = null;
        Auth.save(user);
        renderAvatar(user);
        updateChrome();
        toast('Фото удалено');
      });

      var form = $('#acc-form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var user = Auth.user();
        var name = $('#acc-name'), phone = $('#acc-phone'), email = $('#acc-email');
        $('#acc-status').textContent = '';
        var ok = setErr(name, nameOk(name.value) ? '' : 'Укажите фамилию и имя');
        ok = setErr(phone, phoneOk(phone.value) ? '' : 'Введите номер полностью: +7 (999) 123-45-67') && ok;
        var other = Auth.byEmail(email.value);
        ok = setErr(email, !EMAIL_RE.test(email.value.trim()) ? 'Проверьте адрес почты'
          : other && other.id !== user.id ? 'Эта почта уже привязана к другому аккаунту' : '') && ok;
        if (!ok) { focusFirstError(form); return; }
        user.name = name.value.trim().replace(/\s+/g, ' ');
        user.phone = phone.value;
        user.email = norm(email.value);
        Auth.save(user);
        renderAccount();
        $('#acc-status').textContent = 'Данные сохранены';
      });

      var pform = $('#acc-pass-form');
      pform.addEventListener('submit', function (e) {
        e.preventDefault();
        var user = Auth.user();
        var oldP = $('#acc-pass-old'), newP = $('#acc-pass-new'), newP2 = $('#acc-pass-new2');
        $('#acc-pass-status').textContent = '';
        var ok = setErr(oldP, Auth.checkPass(user, oldP.value) ? '' : 'Текущий пароль указан неверно');
        var problem = passProblem(newP.value) || (newP.value === oldP.value ? 'Новый пароль совпадает с текущим' : '');
        ok = setErr(newP, problem) && ok;
        ok = setErr(newP2, newP2.value && newP2.value === newP.value ? '' : 'Пароли не совпадают') && ok;
        if (!ok) { focusFirstError(pform); return; }
        Auth.setPass(user, newP.value);
        Auth.save(user);
        pform.reset();
        $('#acc-pass-status').textContent = 'Пароль изменён';
      });

      $('#acc-logout').addEventListener('click', function () {
        Auth.logout();
        updateChrome();
        toast('Вы вышли из аккаунта');
        go('home');
      });
      bound.account = true;
    }
    clearErrors($('#acc-form'));
    clearErrors($('#acc-pass-form'));
    $('#acc-status').textContent = '';
    $('#acc-pass-status').textContent = '';
    $('#acc-name').value = u.name;
    $('#acc-phone').value = u.phone || '';
    $('#acc-email').value = u.email;
    renderAccount();
  }

  /* ---------- Запуск ---------- */
  var PAGES = {
    home: initHome, catalog: initCatalog, cart: initCart, favorites: initFavorites,
    login: initLogin, register: initRegister, account: initAccount
  };

  function start(page) {
    current = { page: page, refresh: null };
    setActive(page);
    updateChrome();
    if (page !== 'catalog') $('#hdr-q').value = '';
    PAGES[page](pageParams());
  }

  function route() {
    var page = location.hash.slice(1) || 'home';
    if (ROUTES.indexOf(page) === -1) page = 'home';
    $$('main[data-route]').forEach(function (m) { m.hidden = m.getAttribute('data-route') !== page; });
    start(page);
    window.scrollTo(0, 0);
  }

  seed();
  renderChrome();
  $$('[data-art-static]').forEach(function (el) {
    el.innerHTML = window.drawAppliance(el.getAttribute('data-art-static'), el.getAttribute('data-color'));
  });
  if (SPA) {
    window.addEventListener('hashchange', route);
    route();
  } else {
    start(document.body.getAttribute('data-page') || 'home');
  }
})();
