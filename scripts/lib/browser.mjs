import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
export const WIDTH = 720;
export const HEIGHT = 1280;

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 120_000,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ],
  });
}

export async function openStage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  const url = `${pathToFileURL(path.join(root, 'hype.html')).href}?render=1`;
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await window.hypeReady;
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  const missing = await page.evaluate(() =>
    ['500 1em "Plus Jakarta Sans"', '700 1em "Plus Jakarta Sans"', '800 1em "Plus Jakarta Sans"', '500 1em "JetBrains Mono"', '700 1em "JetBrains Mono"']
      .filter((f) => !document.fonts.check(f))
  );
  if (missing.length) throw new Error(`Fonts not loaded: ${missing.join(', ')}`);
  return page;
}

export async function shoot(page, t, file) {
  await page.evaluate((time) => window.renderAt(time), t);
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
}
