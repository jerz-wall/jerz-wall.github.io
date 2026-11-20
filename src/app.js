// KITZ · קיר החולצות
// אפליקציית עמוד יחיד: כל הנתונים מגיעים מ-data.json שנוצר בסקריפט הבנייה.

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const view = $('#view');
let DATA;
const byTeam = new Map();
const teamById = new Map();
const shirtByCode = new Map();
let searchIndex = [];

const ICONS = { club: '⚽', national: '🌍', nba: '🏀' };
const TYPE_ORDER = ['home', 'away', 'third', 'goalkeeper', 'special', 'retro'];
const countLabel = (n) => (n === 1 ? 'חולצה אחת' : `${n} חולצות`);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- נרמול לחיפוש: עברית ואנגלית, בלי ניקוד, בלי מקפים וגרשים ----------

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/['"`’׳״.\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- קישורים ----------

const teamHref = (t) => (t.category === 'club' ? `#/club/${t.country}/${t.key}` : `#/${t.category}/${t.key}`);
const shirtHref = (s) => `#/shirt/${s.code}`;
const catOf = (key) => DATA.categories.find((c) => c.key === key);
const typeHe = (t) => DATA.types[t]?.he || t;
const coverOf = (list) => list[0]?.images[0];

// ---------- רכיבים ----------

function crumbs(items) {
  return `<nav class="crumbs" aria-label="פירורי לחם"><a href="#/" class="crumb-home" aria-label="ראשי">⌂</a>${items
    .map((it, i) =>
      i === items.length - 1 || !it.href
        ? `<span class="sep">›</span><span aria-current="page">${esc(it.label)}</span>`
        : `<span class="sep">›</span><a href="${it.href}">${esc(it.label)}</a>`,
    )
    .join('')}</nav>`;
}

function img(image, { size = 's', alt = '', eager = false } = {}) {
  if (!image) return '';
  return `<img src="${image[size]}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${image.w}" height="${image.h}">`;
}

// כפתור ✓ לבחירת חולצה לרשימה
function pickButton(code) {
  const on = picked.has(code);
  return `<button class="pick ${on ? 'on' : ''}" type="button" data-pick="${esc(code)}" aria-pressed="${on}" aria-label="בחירת החולצה לרשימה">✓</button>`;
}

function shirtCard(s, { showTeam = true } = {}) {
  const t = teamById.get(s.team);
  return `<div class="pick-wrap ${picked.has(s.code) ? 'picked' : ''}" data-card="${esc(s.code)}">${pickButton(s.code)}<a class="card shirt-card" href="${shirtHref(s)}">
    <div class="ph">${img(s.images[0], { alt: `${t.he} ${s.season} ${typeHe(s.type)}` })}
      <span class="badge type-${s.type}">${esc(typeHe(s.type))}</span>
      ${isNew(s) ? '<span class="new">חדש</span>' : ''}
      ${s.images.length > 1 ? `<span class="pics" aria-label="${s.images.length} תמונות">${s.images.length} 📷</span>` : ''}
    </div>
    <div class="meta">
      ${showTeam ? `<strong>${esc(t.he)}</strong>` : `<strong>${esc(typeHe(s.type))}</strong>`}
      <span class="sub">${esc(s.season)}${showTeam ? ` · ${esc(typeHe(s.type))}` : ''}</span>
      <code>${esc(s.code)}</code>
    </div>
  </a></div>`;
}

function tile({ href, title, sub, count, image, logo, icon }) {
  const pic = logo || image;
  return `<a class="card tile" href="${href}">
    <div class="ph ${logo ? 'logo' : ''}">${pic ? img(pic, { alt: title }) : `<span class="tile-icon">${icon || '👕'}</span>`}</div>
    <div class="meta">
      <strong>${esc(title)}</strong>
      <span class="sub">${esc(sub || '')}</span>
      ${count != null ? `<span class="count">${countLabel(count)}</span>` : ''}
    </div>
  </a>`;
}

// ---------- עונות ותקופות ----------

const yearOf = (s) => Number(String(s.season).slice(0, 4));
let latestYear = 0; // השנה של העונה האחרונה שיש באתר
let manyYears = false; // האם יש באתר חולצות מיותר משנה אחת

// התקופה של חולצה: העונה הנוכחית, עשור (2010, 2000, 1990...) או קלאסיקות (לפני 1980)
function eraOf(s) {
  const y = yearOf(s);
  if (y === latestYear) return 'now';
  if (y < 1980) return 'classic';
  return String(Math.floor(y / 10) * 10);
}
const eraLabel = (k) =>
  k === 'now' ? 'העונה הנוכחית' : k === 'classic' ? 'קלאסיקות' : +k >= 2000 ? `שנות ה-${k}` : `שנות ה-${k.slice(2)}`;
const eraRank = (k) => (k === 'now' ? 1e6 : k === 'classic' ? 0 : +k);

// תגית "חדש" רק כשיש באתר גם חולצות משנים קודמות
const isNew = (s) => manyYears && yearOf(s) === latestYear;

// סינון לפי תקופה ולפי סוג. הבחירה נשמרת בכתובת (?era=2000&type=away) כדי שכפתור "אחורה" יעבוד
function filters(list, params, base) {
  const eras = [...new Set(list.map(eraOf))].sort((a, b) => eraRank(b) - eraRank(a));
  const types = TYPE_ORDER.filter((t) => list.some((s) => s.type === t));
  const era = eras.includes(params.get('era')) ? params.get('era') : null;
  const type = types.includes(params.get('type')) ? params.get('type') : null;
  const filtered = list.filter((s) => (!era || eraOf(s) === era) && (!type || s.type === type));

  const href = (next) => {
    const p = new URLSearchParams();
    const e = 'era' in next ? next.era : era;
    const t = 'type' in next ? next.type : type;
    if (e) p.set('era', e);
    if (t) p.set('type', t);
    const qs = p.toString();
    return base + (qs ? `?${qs}` : '');
  };
  const row = (key, items, active, allLabel, label, aria) =>
    items.length < 2
      ? ''
      : `<div class="chips ${key}-filter" role="group" aria-label="${aria}">${[null, ...items]
          .map((v) => {
            const on = v === active;
            return `<a class="chip ${on ? 'on' : ''}" href="${href({ [key]: v })}" ${on ? 'aria-current="true"' : ''}>${esc(v ? label(v) : allLabel)}</a>`;
          })
          .join('')}</div>`;

  const html =
    row('era', eras, era, 'כל השנים', eraLabel, 'סינון לפי תקופה') +
    row('type', types, type, 'כל הסוגים', typeHe, 'סינון לפי סוג');
  return { html: html ? `<div class="filters">${html}</div>` : '', list: filtered };
}

// חולצות של קבוצה מחולקות לפי עונה, מהחדשה לישנה
const seasonTitle = (season) => (season.includes('-') ? `עונת ${season}` : season);
function bySeason(list) {
  const seasons = [...new Set(list.map((s) => s.season))].sort((a, b) => b.localeCompare(a));
  return seasons
    .map(
      (se) => `<section class="season"><h2 class="season-title">${esc(seasonTitle(se))}</h2>${grid(
        list.filter((s) => s.season === se).map((s) => shirtCard(s, { showTeam: false })).join(''),
      )}</section>`,
    )
    .join('');
}

const grid = (inner, cls = '') => `<div class="grid ${cls}">${inner}</div>`;
const empty = (icon, title, text) =>
  `<div class="empty"><div class="empty-icon">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;

// ---------- דפים ----------

function pageHome(params) {
  const cats = DATA.categories
    .map((c) => {
      const list = DATA.shirts.filter((s) => s.category === c.key);
      return `<a class="card cat-card cat-${c.key}" href="#/${c.key}">
        <div class="cat-bg">${list.length ? img(coverOf(list), { size: 'l', alt: '' }) : ''}</div>
        <div class="cat-body">
          <span class="cat-icon">${ICONS[c.key]}</span>
          <h2>${esc(c.he)}</h2>
          <span class="cat-count">${list.length ? countLabel(list.length) : 'בקרוב'}</span>
        </div>
      </a>`;
    })
    .join('');
  const f = filters(DATA.shirts, params, '#/');
  return {
    title: '',
    html: `
      <section class="hero">
        <h1>${esc(DATA.subtitle)}</h1>
        <p>${DATA.shirts.length} חולצות. בחרו קטגוריה, חפשו קבוצה, או פשוט תגללו.</p>
      </section>
      <section class="cats">${cats}</section>
      <section>
        <div class="section-head"><h2>כל הקיר</h2>${f.html}</div>
        ${grid(f.list.map((s) => shirtCard(s)).join(''))}
      </section>`,
  };
}

function pageCountries() {
  const cat = catOf('club');
  const list = Object.values(DATA.countries).sort((a, b) => a.he.localeCompare(b.he, 'he'));
  return {
    title: cat.he,
    html: `${crumbs([{ label: cat.he }])}
      <div class="page-head"><h1>${esc(cat.he)}</h1><p>בחרו מדינה</p></div>
      ${grid(
        list
          .map((c) => {
            const shirts = DATA.shirts.filter((s) => s.country === c.key);
            return tile({ href: `#/club/${c.key}`, title: c.he, sub: c.en, count: shirts.length, image: coverOf(shirts), logo: c.logo });
          })
          .join(''),
        'tiles',
      )}`,
  };
}

function pageCountry(countryKey) {
  const cat = catOf('club');
  const country = DATA.countries[countryKey];
  if (!country) return notFound();
  const teams = DATA.teams.filter((t) => t.category === 'club' && t.country === countryKey).sort((a, b) => a.he.localeCompare(b.he, 'he'));
  return {
    title: country.he,
    html: `${crumbs([{ label: cat.he, href: '#/club' }, { label: country.he }])}
      <div class="page-head"><h1>${esc(country.he)}</h1><p>${esc(country.en)} · בחרו קבוצה</p></div>
      ${grid(teams.map((t) => tile({ href: teamHref(t), title: t.he, sub: t.en, count: t.count, image: coverOf(byTeam.get(t.id)), logo: t.logo })).join(''), 'tiles')}`,
  };
}

function pageTeamList(category) {
  const cat = catOf(category);
  const teams = DATA.teams.filter((t) => t.category === category).sort((a, b) => a.he.localeCompare(b.he, 'he'));
  const body = teams.length
    ? grid(teams.map((t) => tile({ href: teamHref(t), title: t.he, sub: t.en, count: t.count, image: coverOf(byTeam.get(t.id)), logo: t.logo })).join(''), 'tiles')
    : empty(ICONS[category], 'בקרוב', 'החולצות הראשונות בדרך. תחזרו לבדוק!');
  return {
    title: cat.he,
    html: `${crumbs([{ label: cat.he }])}
      <div class="page-head"><h1>${esc(cat.he)}</h1><p>${category === 'national' ? 'הנבחרות לפי סדר א״ב' : 'בחרו קבוצה'}</p></div>
      ${body}`,
  };
}

function teamCrumbs(t, last) {
  const cat = catOf(t.category);
  const items = [{ label: cat.he, href: `#/${t.category}` }];
  if (t.category === 'club') items.push({ label: DATA.countries[t.country]?.he || t.country, href: `#/club/${t.country}` });
  items.push(last ? { label: t.he, href: teamHref(t) } : { label: t.he });
  if (last) items.push({ label: last });
  return crumbs(items);
}

function pageTeam(id, params) {
  const t = teamById.get(id);
  if (!t) return notFound();
  const f = filters(byTeam.get(id), params, teamHref(t));
  return {
    title: t.he,
    html: `${teamCrumbs(t)}
      <div class="page-head team-head">${t.logo ? `<span class="crest">${img(t.logo, { eager: true })}</span>` : ''}<div><h1>${esc(t.he)}</h1><p>${esc(t.en)} · ${countLabel(t.count)}</p></div></div>
      ${f.html}
      ${bySeason(f.list)}`,
  };
}

function pageShirt(code) {
  const s = shirtByCode.get(code);
  if (!s) return notFound();
  const t = teamById.get(s.team);
  const cat = catOf(s.category);
  const country = s.country ? DATA.countries[s.country] : null;
  const many = s.images.length > 1;
  const alt = `${t.he} ${s.season} ${typeHe(s.type)}`;
  const slides = s.images
    .map(
      (im, i) => `<button class="slide" type="button" data-i="${i}" aria-label="הגדלת תמונה ${i + 1}">
        <img src="${im.l}" srcset="${im.s} 640w, ${im.l} ${im.w}w" sizes="(min-width: 900px) 520px, 100vw"
             alt="${esc(alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="${im.w}" height="${im.h}">
      </button>`,
    )
    .join('');
  const more = byTeam.get(t.id).filter((x) => x.code !== s.code);
  return {
    title: `${t.he} ${s.season} ${typeHe(s.type)}`,
    html: `${teamCrumbs(t, `${s.season} · ${typeHe(s.type)}`)}
      <article class="shirt-page">
        <div class="gallery-wrap">
          <div class="gallery" id="gallery">${slides}</div>
          ${many ? `<button class="gal-arrow gal-prev" type="button" aria-label="הקודמת">‹</button>
                    <button class="gal-arrow gal-next" type="button" aria-label="הבאה">›</button>
                    <div class="dots">${s.images.map((_, i) => `<button type="button" data-i="${i}" aria-label="תמונה ${i + 1}" ${i ? '' : 'class="on"'}></button>`).join('')}</div>` : ''}
          <span class="zoom-hint">🔍 לחצו להגדלה</span>
        </div>
        <div class="info">
          <span class="badge big type-${s.type}">${esc(typeHe(s.type))}</span>
          <h1>${esc(t.he)}</h1>
          <p class="en">${esc(t.en)}</p>
          <dl>
            <div><dt>עונה</dt><dd>${esc(s.season)}</dd></div>
            <div><dt>סוג</dt><dd>${esc(typeHe(s.type))}</dd></div>
            <div><dt>קטגוריה</dt><dd>${esc(cat.he)}</dd></div>
            ${country ? `<div><dt>מדינה</dt><dd>${esc(country.he)}</dd></div>` : ''}
          </dl>
          <button class="code-btn" type="button" data-copy="${esc(s.code)}" aria-label="העתקת קוד החולצה">
            <span class="code-label">קוד חולצה</span>
            <code>${esc(s.code)}</code>
            <span class="code-copy">העתקה</span>
          </button>
          <button class="pick-big ${picked.has(s.code) ? 'on' : ''}" type="button" data-pick="${esc(s.code)}" aria-pressed="${picked.has(s.code)}">
            <span class="pick-mark">✓</span><span class="pick-text">${picked.has(s.code) ? 'נבחרה לרשימה' : 'בחירה לרשימה'}</span>
          </button>
          <div class="list-actions shirt-share">${shareButtons(s.code)}</div>
        </div>
      </article>
      ${more.length ? `<section><div class="section-head"><h2>עוד חולצות של ${esc(t.he)}</h2></div>${grid(more.map((x) => shirtCard(x, { showTeam: false })).join(''))}</section>` : ''}`,
    after: () => setupGallery(s),
  };
}

function pageSearch(q, params) {
  const hits = rank(q, 50);
  const teamIds = new Set();
  const codes = new Set();
  for (const h of hits) {
    if (h.kind === 'team') teamIds.add(h.id);
    if (h.kind === 'country') DATA.teams.filter((t) => t.country === h.id).forEach((t) => teamIds.add(t.id));
    if (h.kind === 'category') DATA.teams.filter((t) => t.category === h.id).forEach((t) => teamIds.add(t.id));
    if (h.kind === 'shirt') codes.add(h.id);
  }
  const list = DATA.shirts.filter((s) => teamIds.has(s.team) || codes.has(s.code));
  const f = filters(list, params, `#/search/${encodeURIComponent(q)}`);
  const teamChips = [...teamIds].map((id) => teamById.get(id)).map((t) => `<a class="chip" href="${teamHref(t)}">${esc(t.he)}</a>`).join('');
  return {
    title: `חיפוש: ${q}`,
    html: `${crumbs([{ label: 'חיפוש' }])}
      <div class="page-head"><h1>“${esc(q)}”</h1><p>${list.length ? countLabel(list.length) : 'לא מצאנו כלום'}</p></div>
      ${teamChips ? `<div class="chips">${teamChips}</div>` : ''}
      ${list.length ? f.html + grid(f.list.map((s) => shirtCard(s)).join('')) : empty('🤷', 'אין תוצאות', 'נסו שם אחר, באנגלית או בעברית, או כינוי כמו בארסה.')}`,
  };
}

function notFound() {
  return { title: 'לא נמצא', html: empty('🧐', 'הדף לא נמצא', 'אולי החולצה זזה מקום. חזרו לדף הבית ונסו שוב.') + '<p class="center"><a class="chip on" href="#/">לדף הבית</a></p>' };
}

// ---------- ניתוב ----------

let lastPath = null;

function route() {
  closeSuggest();
  const raw = location.hash.replace(/^#\/?/, '');
  const [p, qs = ''] = raw.split('?');
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs);
  const [a, b, c] = parts;

  let page;
  if (!a) page = pageHome(params);
  else if (a === 'club') page = !b ? pageCountries() : !c ? pageCountry(b) : pageTeam(`club/${c}`, params);
  else if (a === 'national' || a === 'nba') page = b ? pageTeam(`${a}/${b}`, params) : pageTeamList(a);
  else if (a === 'shirt') page = pageShirt(b);
  else if (a === 'search') page = pageSearch(b || '', params);
  else if (a === 'list') page = pageList(params);
  else page = notFound();

  const newPage = p !== lastPath;
  lastPath = p;

  const paint = () => {
    view.innerHTML = page.html;
    if (newPage) window.scrollTo({ top: 0, behavior: 'instant' });
    page.after?.();
    markPopular();
    updateListBar();
  };

  document.title = page.title ? `${page.title} · KITZ` : `KITZ · ${DATA.subtitle}`;
  if (newPage && document.startViewTransition && !reduceMotion && !document.hidden) {
    const vt = document.startViewTransition(paint);
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {});
  } else if (newPage) {
    paint();
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
  } else {
    paint();
  }
}

// ---------- כפתורי סינון מהיר ----------

function renderPopular() {
  const el = $('#popular');
  el.innerHTML = DATA.popular
    .map((id) => teamById.get(id))
    .filter(Boolean)
    .map((t) => `<a class="chip" href="${teamHref(t)}" data-team="${t.id}"><span>${ICONS[t.category]}</span>${esc(t.he)}</a>`)
    .join('');
  el.hidden = !el.innerHTML;
}

function markPopular() {
  const p = location.hash.split('?')[0];
  $$('#popular .chip').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === p));
}

// ---------- חיפוש עם השלמה אוטומטית ----------

function buildIndex() {
  searchIndex = [];
  for (const c of DATA.categories) {
    if (!c.count) continue;
    searchIndex.push({ kind: 'category', id: c.key, label: c.he, sub: c.en, href: `#/${c.key}`, icon: ICONS[c.key], terms: [c.he, c.en, c.key], rank: 1 });
  }
  for (const c of Object.values(DATA.countries)) {
    searchIndex.push({ kind: 'country', id: c.key, label: c.he, sub: `${c.en} · כדורגל קבוצות`, href: `#/club/${c.key}`, icon: '🗺️', terms: [c.he, c.en, c.key, c.code, ...(c.aliases || [])], rank: 2 });
  }
  for (const t of DATA.teams) {
    searchIndex.push({
      kind: 'team', id: t.id, label: t.he, sub: `${t.en} · ${catOf(t.category).he}`, href: teamHref(t),
      image: t.logo || coverOf(byTeam.get(t.id)), logo: !!t.logo, terms: [t.he, t.en, t.key, t.code, ...t.aliases], rank: 3,
    });
  }
  for (const s of DATA.shirts) {
    const t = teamById.get(s.team);
    searchIndex.push({ kind: 'shirt', id: s.code, label: s.code, sub: `${t.he} · ${s.season} · ${typeHe(s.type)}`, href: shirtHref(s), image: s.images[0], terms: [s.code], codeOnly: true, rank: 0 });
  }
  for (const e of searchIndex) e.nterms = e.terms.filter(Boolean).map(norm);
}

function score(e, q) {
  let best = 0;
  for (const term of e.nterms) {
    if (e.codeOnly) {
      if (q.length >= 2 && term.startsWith(q.replace(/ /g, ''))) best = Math.max(best, 60);
      continue;
    }
    if (term === q) best = Math.max(best, 100);
    else if (term.startsWith(q)) best = Math.max(best, 75);
    else if (term.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 55);
    else if (q.length >= 3 && term.includes(q)) best = Math.max(best, 30);
  }
  return best;
}

function rank(query, min = 1) {
  const q = norm(query);
  if (!q) return [];
  return searchIndex
    .map((e) => ({ ...e, score: score(e, q) }))
    .filter((e) => e.score >= min)
    .sort((a, b) => b.score - a.score || b.rank - a.rank);
}

let suggestItems = [];
let activeIdx = -1;
const input = $('#q');
const list = $('#suggest');

function drawSuggest() {
  if (!suggestItems.length) {
    list.innerHTML = input.value.trim() ? `<li class="none">לא מצאנו… נסו שם אחר</li>` : '';
  } else {
    list.innerHTML = suggestItems
      .map(
        (e, i) => `<li role="option" id="sg-${i}" aria-selected="${i === activeIdx}" data-href="${e.href}" class="${i === activeIdx ? 'on' : ''}">
          <span class="sg-thumb ${e.logo ? 'logo' : ''}">${e.image ? `<img src="${e.image.s}" alt="">` : e.icon || ''}</span>
          <span class="sg-text"><b>${esc(e.label)}</b><small>${esc(e.sub)}</small></span>
        </li>`,
      )
      .join('');
  }
  const open = !!list.innerHTML;
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  input.setAttribute('aria-activedescendant', activeIdx >= 0 ? `sg-${activeIdx}` : '');
}

function closeSuggest() {
  suggestItems = [];
  activeIdx = -1;
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
}

function go(href) {
  input.value = '';
  closeSuggest();
  input.blur();
  location.hash = href;
}

function setupSearch() {
  input.addEventListener('input', () => {
    suggestItems = rank(input.value).slice(0, 7);
    activeIdx = -1;
    drawSuggest();
  });
  input.addEventListener('focus', () => input.value && input.dispatchEvent(new Event('input')));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestItems.length) return;
      e.preventDefault();
      const n = suggestItems.length;
      activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      drawSuggest();
    } else if (e.key === 'Escape') {
      closeSuggest();
    }
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeIdx >= 0) return go(suggestItems[activeIdx].href);
    const q = input.value.trim();
    if (q) go(`#/search/${encodeURIComponent(q)}`);
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-href]');
    if (li) go(li.dataset.href);
  });
  input.addEventListener('blur', () => setTimeout(closeSuggest, 120));
}

// ---------- גלריה בדף חולצה ----------

const isRtl = (el) => getComputedStyle(el).direction === 'rtl';
const slideIndex = (track) => Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
const scrollToSlide = (track, i, smooth = true) =>
  track.scrollTo({ left: (isRtl(track) ? -1 : 1) * i * track.clientWidth, behavior: smooth && !reduceMotion ? 'smooth' : 'instant' });

const setEdges = (i, n, prev, next) => {
  prev?.classList.toggle('off', i <= 0);
  next?.classList.toggle('off', i >= n - 1);
};

function setupGallery(shirt) {
  const track = $('#gallery');
  if (!track) return;
  const dots = $$('.dots button');
  const n = shirt.images.length;
  track.addEventListener(
    'scroll',
    () => {
      const i = slideIndex(track);
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
      setEdges(i, n, $('.gal-prev'), $('.gal-next'));
    },
    { passive: true },
  );
  setEdges(0, n, $('.gal-prev'), $('.gal-next'));
  dots.forEach((d) => d.addEventListener('click', () => scrollToSlide(track, +d.dataset.i)));
  $('.gal-next')?.addEventListener('click', () => scrollToSlide(track, Math.min(slideIndex(track) + 1, n - 1)));
  $('.gal-prev')?.addEventListener('click', () => scrollToSlide(track, Math.max(slideIndex(track) - 1, 0)));
  $$('.slide', track).forEach((b) => b.addEventListener('click', () => openLightbox(shirt, +b.dataset.i)));
}

// ---------- תצוגה מוגדלת ----------

const lb = $('#lightbox');
const lbTrack = $('.lb-track', lb);
let lbOpen = false;

function openLightbox(shirt, start) {
  const t = teamById.get(shirt.team);
  lbTrack.innerHTML = shirt.images
    .map((im) => `<div class="lb-slide"><img src="${im.l}" alt="${esc(`${t.he} ${shirt.season}`)}" width="${im.w}" height="${im.h}"></div>`)
    .join('');
  lb.classList.toggle('single', shirt.images.length < 2);
  lb.hidden = false;
  document.body.classList.add('no-scroll');
  lbOpen = true;
  history.pushState({ lightbox: true }, '');
  requestAnimationFrame(() => {
    scrollToSlide(lbTrack, start, false);
    updateCount();
    lb.classList.add('show');
  });
  $('.lb-close', lb).focus({ preventScroll: true });
}

function closeLightboxUi() {
  if (!lbOpen) return;
  lbOpen = false;
  lb.classList.remove('show');
  document.body.classList.remove('no-scroll');
  setTimeout(() => {
    lb.hidden = true;
    lbTrack.innerHTML = '';
  }, 200);
}

const closeLightbox = () => (history.state?.lightbox ? history.back() : closeLightboxUi());

function updateCount() {
  const n = lbTrack.children.length;
  $('.lb-count', lb).textContent = n > 1 ? `${slideIndex(lbTrack) + 1} / ${n}` : '';
  setEdges(slideIndex(lbTrack), n, $('.lb-prev', lb), $('.lb-next', lb));
}

function lbStep(dir) {
  const n = lbTrack.children.length;
  $$('.lb-slide.zoom', lbTrack).forEach((s) => s.classList.remove('zoom'));
  scrollToSlide(lbTrack, Math.min(Math.max(slideIndex(lbTrack) + dir, 0), n - 1));
}

lbTrack.addEventListener('scroll', updateCount, { passive: true });
lbTrack.addEventListener('click', (e) => {
  const slide = e.target.closest('.lb-slide');
  if (!slide) return;
  if (e.target.tagName !== 'IMG') return closeLightbox();
  const im = e.target;
  const r = im.getBoundingClientRect();
  const rx = (e.clientX - r.left) / r.width;
  const ry = (e.clientY - r.top) / r.height;
  const zoomed = slide.classList.toggle('zoom');
  lb.classList.add('used');
  if (zoomed) {
    requestAnimationFrame(() => {
      slide.scrollLeft = rx * im.offsetWidth - slide.clientWidth / 2;
      slide.scrollTop = ry * im.offsetHeight - slide.clientHeight / 2;
    });
  }
});
$('.lb-close', lb).addEventListener('click', closeLightbox);
$('.lb-next', lb).addEventListener('click', () => lbStep(1));
$('.lb-prev', lb).addEventListener('click', () => lbStep(-1));
window.addEventListener('popstate', closeLightboxUi);
document.addEventListener('keydown', (e) => {
  if (!lbOpen) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lbStep(1); // בעברית "הבאה" נמצאת משמאל
  if (e.key === 'ArrowRight') lbStep(-1);
});

// ---------- העתקת קוד ----------

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

view.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    toast(`הקוד ${btn.dataset.copy} הועתק ✔`);
  } catch {
    toast(btn.dataset.copy);
  }
  btn.classList.add('copied');
  setTimeout(() => btn.classList.remove('copied'), 900);
});

// ---------- הרשימה שלי: בחירת חולצות ושליחה בוואטסאפ ----------
// הבחירה נשמרת בדפדפן של מי שבחר. כדי להעביר אותה לחבר שולחים קישור שמכיל את קודי החולצות.

const LIST_KEY = 'kitz-list';
const picked = new Set();

function loadPicked() {
  try {
    for (const c of JSON.parse(localStorage.getItem(LIST_KEY) || '[]')) if (shirtByCode.has(c)) picked.add(c);
  } catch {}
}
function savePicked() {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify([...picked]));
  } catch {}
}

const siteUrl = () => location.origin + location.pathname;
const listUrl = (codes) => `${siteUrl()}#/list?c=${codes.join(',')}`;
const pickedShirts = () => DATA.shirts.filter((s) => picked.has(s.code));

function whatsappText(list) {
  const lines = list.map((s, i) => {
    const t = teamById.get(s.team);
    return `${i + 1}. ${t.he} · ${s.season} · ${typeHe(s.type)}\n    ${s.code}`;
  });
  return `👕 החולצות שבחרתי ב-KITZ:\n\n${lines.join('\n')}\n\nלצפייה בחולצות:\n${listUrl(list.map((s) => s.code))}`;
}

function shirtShareText(s) {
  const t = teamById.get(s.team);
  return `👕 תראו את החולצה הזו ב-KITZ:\n${t.he} · ${s.season} · ${typeHe(s.type)}\n${s.code}\n\n${siteUrl()}#/shirt/${s.code}`;
}

const canShare = typeof navigator.share === 'function';
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4 4h-3v7h-2V7H8l4-4zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z"/></svg>';

function shareButtons(code = '') {
  const c = code ? ` data-code="${esc(code)}"` : '';
  return `<button class="btn btn-wa" type="button" data-share="whatsapp"${c}>${WA_ICON}שליחה בוואטסאפ</button>
              <button class="btn" type="button" data-share="${canShare ? 'native' : 'copy'}"${c}>${canShare ? `${SHARE_ICON}שיתוף` : code ? 'העתקת קישור' : 'העתקת ההודעה'}</button>`;
}

function togglePick(code) {
  const on = !picked.has(code);
  if (on) picked.add(code);
  else picked.delete(code);
  savePicked();
  $$(`[data-pick="${code}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    const text = $('.pick-text', b);
    if (text) text.textContent = on ? 'נבחרה לרשימה' : 'בחירה לרשימה';
  });
  $$(`[data-card="${code}"]`).forEach((c) => c.classList.toggle('picked', on));
  toast(on ? 'נוספה לרשימה ✓' : 'הוסרה מהרשימה');
  updateListBar();
  if (location.hash.startsWith('#/list') && !location.hash.includes('c=')) route();
}

// הפס הקבוע למטה: כמה חולצות נבחרו וקישור לרשימה
function updateListBar() {
  const bar = $('#listbar');
  const n = picked.size;
  const hide = !n || location.hash.startsWith('#/list');
  bar.classList.toggle('show', !hide);
  document.body.classList.toggle('has-bar', !hide);
  if (n) $('.lb-num', bar).textContent = n === 1 ? 'חולצה אחת נבחרה' : `${n} חולצות נבחרו`;
}

function pageList(params) {
  const shared = (params.get('c') || '').split(',').filter((c) => shirtByCode.has(c));
  if (params.has('c')) {
    // רשימה שחבר שלח בקישור
    const list = DATA.shirts.filter((s) => shared.includes(s.code));
    return {
      title: 'רשימה ששלחו לך',
      html: `${crumbs([{ label: 'רשימה ששלחו לך' }])}
        <div class="page-head"><h1>רשימה ששלחו לך</h1><p>${list.length ? countLabel(list.length) : 'הרשימה ריקה'}</p></div>
        ${list.length ? `<div class="list-actions"><button class="btn" type="button" data-adopt="${shared.join(',')}">✓ הוספה לרשימה שלי</button></div>${grid(list.map((s) => shirtCard(s)).join(''))}` : empty('🤷', 'אין כאן חולצות', 'אולי הקישור לא שלם. בקשו מהחבר לשלוח אותו שוב.')}`,
    };
  }
  const list = pickedShirts();
  return {
    title: 'הרשימה שלי',
    html: `${crumbs([{ label: 'הרשימה שלי' }])}
      <div class="page-head"><h1>הרשימה שלי</h1><p>${list.length ? countLabel(list.length) : 'עוד לא בחרתם חולצות'}</p></div>
      ${
        list.length
          ? `<div class="list-actions">
              ${shareButtons()}
              <button class="btn btn-ghost" type="button" data-share="clear">ניקוי הרשימה</button>
            </div>
            ${grid(list.map((s) => shirtCard(s)).join(''))}`
          : empty('✓', 'הרשימה ריקה', 'לחצו על ✓ בפינה של חולצה כדי להוסיף אותה לרשימה, ואז שלחו את הרשימה לחברים בוואטסאפ.')
      }`,
  };
}

document.addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    e.preventDefault();
    e.stopPropagation();
    return togglePick(pick.dataset.pick);
  }
  const adopt = e.target.closest('[data-adopt]');
  if (adopt) {
    adopt.dataset.adopt.split(',').forEach((c) => shirtByCode.has(c) && picked.add(c));
    savePicked();
    toast('נוספו לרשימה שלך ✓');
    location.hash = '#/list';
    return;
  }
  const share = e.target.closest('[data-share]');
  if (!share) return;
  const one = share.dataset.code && shirtByCode.get(share.dataset.code);
  const text = one ? shirtShareText(one) : whatsappText(pickedShirts());
  if (share.dataset.share === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  } else if (share.dataset.share === 'native') {
    try {
      await navigator.share({ title: 'KITZ · קיר החולצות', text });
    } catch {}
  } else if (share.dataset.share === 'copy') {
    try {
      await navigator.clipboard.writeText(text);
      toast(one ? 'הקישור הועתק ✓' : 'ההודעה הועתקה ✓');
    } catch {
      toast('לא הצלחנו להעתיק');
    }
  } else if (share.dataset.share === 'clear' && confirm('לנקות את כל הרשימה?')) {
    picked.clear();
    savePicked();
    route();
  }
});

// ---------- הפעלה ----------

async function init() {
  try {
    const res = await fetch('data.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch {
    view.innerHTML = empty('😵', 'משהו השתבש', 'לא הצלחנו לטעון את החולצות. נסו לרענן את הדף.');
    return;
  }
  for (const t of DATA.teams) {
    teamById.set(t.id, t);
    byTeam.set(t.id, []);
  }
  for (const s of DATA.shirts) {
    shirtByCode.set(s.code, s);
    byTeam.get(s.team)?.push(s);
  }
  const years = DATA.shirts.map(yearOf);
  latestYear = Math.max(...years);
  manyYears = new Set(years).size > 1;
  loadPicked();
  buildIndex();
  renderPopular();
  setupSearch();
  window.addEventListener('hashchange', route);
  route();
}

init();
