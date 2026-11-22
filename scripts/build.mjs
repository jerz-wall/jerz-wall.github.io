// סקריפט הבנייה של JERZ
// סורק את התיקייה shirts/, יוצר קוד לכל חולצה, מכווץ תמונות ובונה את האתר לתוך dist/.
// בעיות בתיקיות (קבוצה חסרה, שם תיקייה שגוי) מוצגות כאזהרה, והבנייה ממשיכה.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIRTS = path.join(ROOT, 'shirts');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache', 'img');
const ON_GITHUB = !!process.env.GITHUB_ACTIONS;

const SIZES = { s: 640, l: 1600 };
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tif', '.tiff', '.svg']);

const CATEGORIES = {
  club:     { prefix: 'CL',  he: 'כדורגל קבוצות', en: 'Club Football' },
  national: { prefix: 'NT',  he: 'כדורגל נבחרות', en: 'National Teams' },
  nba:      { prefix: 'NBA', he: 'כדורסל NBA',    en: 'NBA Basketball' },
};

const TYPES = {
  home:       { letter: 'H', he: 'בית',            en: 'Home' },
  away:       { letter: 'A', he: 'חוץ',            en: 'Away' },
  third:      { letter: 'T', he: 'שלישית',         en: 'Third' },
  goalkeeper: { letter: 'G', he: 'שוער',           en: 'Goalkeeper' },
  special:    { letter: 'S', he: 'מהדורה מיוחדת', en: 'Special Edition' },
  retro:      { letter: 'R', he: 'רטרו',           en: 'Retro' },
};
const TYPE_ALIASES = { gk: 'goalkeeper', keeper: 'goalkeeper', goalie: 'goalkeeper', '3rd': 'third' };
const TYPE_ORDER = Object.keys(TYPES);

// ---------- עזרים ----------

const warnings = [];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function warn(where, problem, fix) {
  warnings.push({ where: rel(where), problem, fix });
}

function fatal(message) {
  console.error(`\n✖ הבנייה נעצרה: ${message}\n  האתר הקיים ממשיך לעבוד כרגיל.\n`);
  if (ON_GITHUB) console.log(`::error title=הבנייה נעצרה::${message}`);
  process.exit(1);
}

// מנקה שם תיקייה: מסיר תווי כיוון נסתרים, אותיות קטנות, רווחים הופכים למקף
const clean = (s) =>
  s.normalize('NFC')
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

async function entries(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => !d.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  } catch {
    return [];
  }
}
const subdirs = async (dir) => (await entries(dir)).filter((d) => d.isDirectory()).map((d) => d.name);
const isImage = (name) => IMAGE_EXT.has(path.extname(name).toLowerCase());

async function readJson(file, label) {
  if (!existsSync(file)) fatal(`הקובץ ${label} לא נמצא.`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    fatal(`יש שגיאת כתיבה בקובץ ${label} (${e.message}). בדקו פסיקים, מירכאות וסוגריים.`);
  }
}

// ---------- פענוח שם תיקיית חולצה ----------
// דוגמאות: 2024-25-home, 2026-away, 1998-retro

function parseShirtFolder(name) {
  const m = clean(name).match(/^(\d{4})(?:-(\d{2}|\d{4}))?-([a-z0-9]+)$/);
  if (!m) return { error: 'format' };
  const [, y1, y2raw, typeRaw] = m;
  const type = TYPE_ALIASES[typeRaw] || typeRaw;
  if (!TYPES[type]) return { error: 'type', typeRaw };
  if (y2raw) {
    const y2 = y2raw.slice(-2);
    if (Number(y2) !== (Number(y1) + 1) % 100) return { error: 'season' };
    return { season: `${y1}-${y2}`, seasonCode: y1.slice(2) + y2, type };
  }
  return { season: y1, seasonCode: y1, type };
}

// ---------- תמונות ----------

async function trimLogo(buf) {
  const flat = await sharp(buf, { density: 300 }).rotate().flatten({ background: '#ffffff' }).png().toBuffer();
  let t;
  try { t = await sharp(flat).trim({ threshold: 30 }).png().toBuffer({ resolveWithObject: true }); } catch { return flat; }
  const pad = Math.round(Math.max(t.info.width, t.info.height) * 0.06);
  return sharp(t.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' }).png().toBuffer();
}

async function processImage(file, { logo = false } = {}) {
  const buf = await fs.readFile(file);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const out = {};
  for (const [size, width] of Object.entries(SIZES)) {
    const name = `${hash}${logo ? '-logo' : ''}-${size}.webp`;
    const cached = path.join(CACHE, name);
    if (!existsSync(cached)) {
      await sharp(logo ? await trimLogo(buf) : buf)
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size === 's' ? 76 : 82 })
        .toFile(cached);
    }
    await fs.copyFile(cached, path.join(DIST, 'img', name));
    out[size] = `img/${name}`;
  }
  const meta = await sharp(path.join(CACHE, `${hash}${logo ? '-logo' : ''}-l.webp`)).metadata();
  out.w = meta.width;
  out.h = meta.height;
  return out;
}

// ---------- סריקה ----------

const teamsFile = path.join(SHIRTS, 'teams.json');
const teamsJson = await readJson(teamsFile, 'shirts/teams.json');
const config = await readJson(path.join(ROOT, 'site.config.json'), 'site.config.json');

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(path.join(DIST, 'img'), { recursive: true });
await fs.mkdir(CACHE, { recursive: true });

const GROUP_NAMES = { countries: 'המדינה', club: 'הקבוצה', national: 'הנבחרת', nba: 'קבוצת ה-NBA' };

function lookup(group, key, where) {
  const info = teamsJson[group]?.[key];
  if (info && info.he && info.en && info.code) return { aliases: [], ...info };
  if (info) {
    warn(where, `ל${GROUP_NAMES[group]} "${key}" ב-teams.json חסר אחד השדות code / he / en.`, 'השלימו את השדה החסר.');
  } else {
    warn(
      where,
      `${GROUP_NAMES[group]} "${key}" לא מופיעה בקובץ teams.json.`,
      `הוסיפו לקובץ shirts/teams.json, בתוך "${group}", שורה כזו: "${key}": { "code": "ABC", "he": "שם בעברית", "en": "English name", "aliases": [] }`,
    );
  }
  return {
    code: info?.code || key.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase(),
    he: info?.he || key,
    en: info?.en || key,
    aliases: info?.aliases || [],
  };
}

const teams = new Map();
const countries = {};
const shirts = [];
const codes = new Map();

for (const top of await entries(SHIRTS)) {
  if (top.isDirectory() && !CATEGORIES[clean(top.name)]) {
    warn(path.join(SHIRTS, top.name), `התיקייה "${top.name}" לא מוכרת, ולכן דילגנו עליה.`, 'תיקיות החולצות צריכות להיות בתוך club, national או nba.');
  }
}

async function addTeam(category, countryKey, country, folderName, teamDir) {
  const key = clean(folderName);
  const info = lookup(category, key, teamDir);
  const id = `${category}/${key}`;
  const team = teams.get(id) || {
    id, category, key, country: countryKey,
    he: info.he, en: info.en, code: info.code, aliases: info.aliases, count: 0,
  };
  teams.set(id, team);

  // תמונה שיושבת ישר בתיקיית הקבוצה היא הסמל של הקבוצה
  const logos = (await entries(teamDir)).filter((f) => f.isFile() && isImage(f.name)).map((f) => f.name);
  if (logos.length > 1) warn(teamDir, `יש ${logos.length} תמונות ישר בתיקיית הקבוצה. רק ${logos[0]} משמשת כסמל.`, 'השאירו בתיקיית הקבוצה תמונה אחת בלבד (הסמל). תמונות של חולצות שימו בתוך תיקייה בשם עונה-סוג, למשל 2024-25-home.');
  if (logos.length && !team.logo) {
    try { team.logo = await processImage(path.join(teamDir, logos[0]), { logo: true }); }
    catch (err) { warn(path.join(teamDir, logos[0]), `לא הצלחנו לקרוא את התמונה (${err.message}).`, 'נסו לשמור אותה מחדש כ-png או jpg ולהעלות שוב.'); }
  }

  for (const e of await entries(teamDir)) {
    const where = path.join(teamDir, e.name);
    if (!e.isDirectory()) continue;
    const parsed = parseShirtFolder(e.name);
    if (parsed.error) {
      const fix = 'השם צריך להיות עונה-סוג, למשל 2024-25-home או 2026-away. הסוגים האפשריים: home, away, third, goalkeeper, special, retro.';
      const problem = {
        format: `שם התיקייה "${e.name}" לא במבנה הנכון.`,
        type: `סוג החולצה "${parsed.typeRaw}" לא מוכר.`,
        season: `העונה בשם "${e.name}" לא תקינה (השנה השנייה צריכה להיות השנה שאחרי הראשונה).`,
      }[parsed.error];
      warn(where, problem, fix);
      continue;
    }

    const files = (await entries(where)).filter((f) => f.isFile() && isImage(f.name)).map((f) => f.name);
    if (!files.length) {
      warn(where, 'אין תמונות בתיקיית החולצה.', 'העלו לתיקייה לפחות תמונה אחת (jpg, png או webp).');
      continue;
    }

    const cat = CATEGORIES[category];
    const code = [cat.prefix, country?.code, info.code, parsed.seasonCode, TYPES[parsed.type].letter]
      .filter(Boolean)
      .join('-');
    if (codes.has(code)) {
      warn(where, `לחולצה הזו יוצא הקוד ${code}, והוא כבר שייך ל-${codes.get(code)}.`, 'כנראה יש שתי תיקיות לאותה חולצה. מחקו או אחדו אחת מהן.');
      continue;
    }
    codes.set(code, rel(where));

    const images = [];
    for (const f of files) {
      try {
        images.push(await processImage(path.join(where, f)));
      } catch (err) {
        warn(path.join(where, f), `לא הצלחנו לקרוא את התמונה (${err.message}).`, 'נסו לשמור אותה מחדש כ-jpg ולהעלות שוב.');
      }
    }
    if (!images.length) continue;

    shirts.push({
      code,
      team: id,
      category,
      country: countryKey,
      season: parsed.season,
      type: parsed.type,
      images,
    });
    team.count++;
    process.stdout.write('.');
  }
}

const catLogos = {};
for (const category of Object.keys(CATEGORIES)) {
  const catDir = path.join(SHIRTS, category);
  // תמונה שיושבת ישר בתיקיית הקטגוריה היא הלוגו של הכרטיס בדף הבית
  const catImgs = (await entries(catDir)).filter((f) => f.isFile() && isImage(f.name)).map((f) => f.name);
  if (catImgs.length > 1) warn(catDir, `יש ${catImgs.length} תמונות בתיקיית הקטגוריה. מוצגת רק ${catImgs[0]}.`, 'השאירו בתיקיית הקטגוריה תמונה אחת בלבד (הלוגו).');
  if (catImgs.length) {
    try { catLogos[category] = await processImage(path.join(catDir, catImgs[0]), { logo: true }); }
    catch (err) { warn(path.join(catDir, catImgs[0]), `לא הצלחנו לקרוא את התמונה (${err.message}).`, 'נסו לשמור אותה מחדש כ-png או jpg ולהעלות שוב.'); }
  }
  if (category === 'club') {
    for (const cName of await subdirs(catDir)) {
      const cKey = clean(cName);
      const cDir = path.join(catDir, cName);
      const country = lookup('countries', cKey, cDir);
      countries[cKey] = { key: cKey, he: country.he, en: country.en, code: country.code, aliases: country.aliases };

      // תמונה שיושבת ישר בתיקיית המדינה (למשל לוגו של הליגה) היא תמונת הכרטיס של המדינה
      const logos = (await entries(cDir)).filter((f) => f.isFile() && isImage(f.name)).map((f) => f.name);
      if (logos.length > 1) {
        warn(cDir, `יש ${logos.length} תמונות בתיקיית המדינה. מוצגת רק ${logos[0]}.`, 'השאירו בתיקיית המדינה תמונה אחת בלבד (הלוגו של הליגה).');
      }
      if (logos.length) {
        try {
          countries[cKey].logo = await processImage(path.join(cDir, logos[0]), { logo: true });
        } catch (err) {
          warn(path.join(cDir, logos[0]), `לא הצלחנו לקרוא את התמונה (${err.message}).`, 'נסו לשמור אותה מחדש כ-png או jpg ולהעלות שוב.');
        }
      }
      for (const tName of await subdirs(cDir)) await addTeam(category, cKey, country, tName, path.join(cDir, tName));
    }
  } else {
    for (const tName of await subdirs(catDir)) await addTeam(category, null, null, tName, path.join(catDir, tName));
  }
}
process.stdout.write('\n');

// ---------- כתיבת נתוני האתר ----------

const catOrder = Object.keys(CATEGORIES);
shirts.sort((a, b) => {
  const ta = teams.get(a.team), tb = teams.get(b.team);
  return (
    catOrder.indexOf(a.category) - catOrder.indexOf(b.category) ||
    ta.he.localeCompare(tb.he, 'he') ||
    b.season.localeCompare(a.season) ||
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
  );
});

const activeTeams = [...teams.values()].filter((t) => t.count > 0);
// כפתור של קבוצה שעוד אין לה חולצות פשוט לא מוצג. אזהרה רק אם השם לא קיים בכלל.
const popular = (config.popular || []).filter((id) => {
  const [cat, key] = String(id).split('/');
  if (!teams.has(id) && !teamsJson[cat]?.[key]) {
    warn(path.join(ROOT, 'site.config.json'), `כפתור הסינון "${id}" לא קיים ב-teams.json.`, 'כתבו קטגוריה/קבוצה בדיוק כמו בתיקייה, למשל club/barcelona.');
  }
  return teams.get(id)?.count > 0;
});

const data = {
  title: config.title || 'JERZ',
  subtitle: config.subtitle || 'קיר החולצות',
  built: new Date().toISOString(),
  categories: catOrder.map((key) => ({ key, ...CATEGORIES[key], logo: catLogos[key], count: shirts.filter((s) => s.category === key).length })),
  types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { he: v.he, en: v.en, letter: v.letter }])),
  countries: Object.fromEntries(Object.entries(countries).filter(([k]) => shirts.some((s) => s.country === k))),
  teams: activeTeams,
  popular,
  shirts,
};

await fs.writeFile(path.join(DIST, 'data.json'), JSON.stringify(data));
// מעתיקים את קבצי האתר. ל-css ול-js מוסיפים גרסה כדי שהדפדפן לא יציג גרסה ישנה מהזיכרון.
const version = {};
for (const e of await entries(SRC)) {
  if (!e.isFile() || e.name === 'index.html') continue;
  const buf = await fs.readFile(path.join(SRC, e.name));
  version[e.name] = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  await fs.writeFile(path.join(DIST, e.name), buf);
}
// אייקון למסך הבית בטלפון
const iconSvg = await fs.readFile(path.join(SRC, 'icon.svg'));
for (const size of [180, 192, 512]) {
  await sharp(iconSvg, { density: 300 }).resize(size, size).png().toFile(path.join(DIST, `icon-${size}.png`));
}
const html = (await fs.readFile(path.join(SRC, 'index.html'), 'utf8')).replace(
  /(href|src)="(styles\.css|app\.js)"/g,
  (m, attr, file) => `${attr}="${file}?v=${version[file]}"`,
);
await fs.writeFile(path.join(DIST, 'index.html'), html);
await fs.writeFile(path.join(DIST, '.nojekyll'), '');

// ---------- סיכום ----------

console.log(`\n✔ נבנו ${shirts.length} חולצות של ${activeTeams.length} קבוצות ונבחרות.`);
for (const c of data.categories) console.log(`   ${c.he}: ${c.count}`);

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} אזהרות (החולצות האלה לא נכנסו לאתר או נכנסו בלי שם מלא):\n`);
  for (const w of warnings) {
    console.log(`  • ${w.where}\n    הבעיה: ${w.problem}\n    איך מתקנים: ${w.fix}\n`);
    if (ON_GITHUB) console.log(`::warning file=${w.where},title=צריך לתקן::${w.problem} ${w.fix}`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  let md = `## JERZ: נבנו ${shirts.length} חולצות\n\n`;
  md += data.categories.map((c) => `- ${c.he}: ${c.count}`).join('\n') + '\n\n';
  if (warnings.length) {
    md += `### ⚠ ${warnings.length} דברים לתקן\n\n| איפה | מה הבעיה | איך מתקנים |\n|---|---|---|\n`;
    md += warnings.map((w) => `| \`${w.where}\` | ${w.problem} | ${w.fix.replace(/\|/g, '\\|')} |`).join('\n') + '\n';
  } else {
    md += 'הכול תקין ✅\n';
  }
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
