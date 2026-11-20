// מקטין את תמונות החולצות המקוריות בתיקייה shirts, כדי שהריפו ב-GitHub יישאר קטן.
// הרצה: npm run shrink        (בדיקה בלבד, בלי לשנות כלום: npm run shrink -- --dry)
// לפני כל שינוי נשמר עותק של המקור בתיקייה kitz-originals בתיקיית הבית.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIRTS = path.join(ROOT, 'shirts');
const BACKUP = path.join(os.homedir(), 'kitz-originals');
const MAX_SIDE = 2000;
const MAX_BYTES = 1024 * 1024;
const DRY = process.argv.includes('--dry');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
// רק תמונות שבתוך תיקיית חולצה (2026-27-home, 2026-away...). לוגואים וסמלים לא נוגעים.
const SHIRT_FOLDER = /^\d{4}(-\d{2})?-/;

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
let checked = 0, changed = 0, before = 0, after = 0;

for await (const file of walk(SHIRTS)) {
  const ext = path.extname(file).toLowerCase();
  if (!IMAGE_EXT.has(ext) || !SHIRT_FOLDER.test(path.basename(path.dirname(file)))) continue;
  checked++;
  const size = (await fs.stat(file)).size;
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch {
    console.log(`⚠ לא הצלחתי לפתוח: ${path.relative(ROOT, file)}`);
    continue;
  }
  if (Math.max(meta.width, meta.height) <= MAX_SIDE && size <= MAX_BYTES) continue;

  const out = await sharp(file)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  if (out.length >= size) continue;

  const rel = path.relative(SHIRTS, file);
  const target = file.slice(0, -ext.length) + (ext === '.jpeg' ? '.jpeg' : '.jpg');
  if (target !== file && existsSync(target)) {
    console.log(`⚠ דילגתי, כבר קיים קובץ בשם ${path.relative(ROOT, target)}`);
    continue;
  }
  console.log(`${rel}: ${mb(size)} → ${mb(out.length)}`);
  changed++;
  before += size;
  after += out.length;
  if (DRY) continue;

  const backup = path.join(BACKUP, rel);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  if (!existsSync(backup)) await fs.copyFile(file, backup);
  await fs.writeFile(target, out);
  if (target !== file) await fs.unlink(file);
}

console.log(`\nנבדקו ${checked} תמונות, ${DRY ? 'אפשר להקטין' : 'הוקטנו'} ${changed}.`);
if (changed) console.log(`${mb(before)} → ${mb(after)} (נחסכו ${mb(before - after)})`);
if (changed && !DRY) console.log(`המקורות נשמרו ב-${BACKUP}`);
