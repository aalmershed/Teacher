const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { renderProject } = require('./render');
const { db, DATA_DIR } = require('./db');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined; // يستخدم المسار الافتراضي لـ Playwright
  const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) return undefined;
  const candidates = ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (const c of candidates) {
    const p = path.join(base, dir, c);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--font-render-hinting=none', '--disable-dev-shm-usage'] })
      .then((b) => { b.on('disconnected', () => { browserPromise = null; }); return b; })
      .catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

async function newPage() {
  try {
    return await (await getBrowser()).newPage();
  } catch (_) {
    // المتصفح أُغلق لأي سبب — نعيد تشغيله مرة واحدة
    browserPromise = null;
    return (await getBrowser()).newPage();
  }
}

function imageDataUrl(userId) {
  const stmt = db.prepare('SELECT mime FROM uploads WHERE id = ? AND user_id = ?');
  return (id) => {
    const row = stmt.get(id, userId);
    if (!row) return '';
    const file = path.join(DATA_DIR, 'uploads', id);
    if (!fs.existsSync(file)) return '';
    return `data:${row.mime};base64,${fs.readFileSync(file).toString('base64')}`;
  };
}

async function projectToPdf(project, baseUrl) {
  const html = await renderProject(project, { embedFonts: true, baseUrl, imageUrl: imageDataUrl(project.user_id) });
  const page = await newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForSelector('body[data-fitted]', { timeout: 15000 }).catch(() => {});
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await page.close();
  }
}

module.exports = { projectToPdf };
