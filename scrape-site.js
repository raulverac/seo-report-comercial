'use strict';

const puppeteer = require('puppeteer');
const sharp     = require('sharp');
const axios     = require('axios');

// ─── Thumbnail via thum.io (gratis, sin API key, imágenes limpias sin popups) ─
// Parámetros: width=1280, crop=700px verticales (hero above the fold)
async function fetchThumbnail(url) {
  const encoded = encodeURIComponent(url);
  const thumbUrl = `https://image.thum.io/get/width/1280/crop/700/noanimate/${url}`;
  try {
    const res = await axios.get(thumbUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' },
    });
    if (res.status !== 200) return null;

    // Procesar con Sharp: escalar a 970px (2× del ancho en PDF) para nitidez retina
    return await sharp(Buffer.from(res.data))
      .resize(970, null, { kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (_) {
    return null;
  }
}

// Selectores comunes de banners de cookies/popups para intentar cerrar
const COOKIE_SELECTORS = [
  'button[id*="accept"]', 'button[class*="accept"]',
  'button[id*="cookie"]', 'button[class*="cookie"]',
  'button[id*="consent"]', 'button[class*="consent"]',
  'button[id*="agree"]', 'button[class*="agree"]',
  'a[id*="accept"]', 'a[class*="accept"]',
  '#onetrust-accept-btn-handler',
  '.cc-accept', '.cc-btn.cc-allow',
  '[data-action="accept"]', '[aria-label="Accept"]',
];

function isAllowedUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  const BLOCKED = [/^localhost$/i, /^127\./, /^0\.0\.0/, /^10\./, /^192\.168\./, /^169\.254\./, /^::1$/, /^\[::1\]/];
  if (BLOCKED.some(re => re.test(host))) return false;
  const m = host.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 31) return false;
  if (!host.includes('.')) return false;
  return true;
}

async function scrapeSite(url) {
  if (!isAllowedUrl(url)) return null;

  // Lanzar thumbnail y Puppeteer en paralelo para no perder tiempo
  const [thumbnail, puppeteerResult] = await Promise.all([
    fetchThumbnail(url),
    scrapeMeta(url),
  ]);

  if (!puppeteerResult && !thumbnail) return null;

  return {
    screenshot: thumbnail || null,
    ...(puppeteerResult || {}),
  };
}

// ─── Puppeteer solo para metadatos SEO (título, descripción, teléfono, email, dirección)
async function scrapeMeta(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 20000 }));

    await new Promise(r => setTimeout(r, 1000));

    const info = await page.evaluate(() => {
      const meta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="og:${name}"]`)?.content || '';

      const rawTitle = document.title || meta('title') || '';
      const title = rawTitle.split(/[|\-–—]/)[0].trim().slice(0, 80);

      const phones = [...document.querySelectorAll('a[href^="tel:"]')]
        .map(a => (a.textContent.trim() || a.href.replace('tel:', '')).trim())
        .filter(Boolean);

      const emails = [...document.querySelectorAll('a[href^="mailto:"]')]
        .map(a => (a.textContent.trim() || a.href.replace('mailto:', '')).trim())
        .filter(t => t.includes('@'));

      const address =
        document.querySelector('[itemprop="streetAddress"]')?.textContent?.trim() ||
        document.querySelector('[itemprop="address"]')?.textContent?.trim() || '';

      return {
        title,
        description: (meta('description') || meta('og:description') || '').slice(0, 220),
        phone:   phones[0] || '',
        email:   emails[0] || '',
        address: address.slice(0, 80),
      };
    });

    return info;

  } catch (err) {
    console.error('scrapeMeta error:', err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeSite };
