import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { launch, openStage, shoot, root } from './lib/browser.mjs';

const FPS = 30;
const FRAMES = 900;
const WORKERS = Math.max(1, Math.min(Number(process.env.WORKERS) || os.cpus().length, 6));
const outDir = path.join(root, process.env.FRAMES_DIR || 'out/frames');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const started = Date.now();
let done = 0;

// One browser per worker: background tabs sharing a browser get throttled and stall on font/image readiness.
async function worker(w) {
  const browser = await launch();
  try {
    const page = await openStage(browser);
    const total = await page.evaluate(() => window.HYPE.TOTAL);
    if (Math.round(total * FPS) !== FRAMES) throw new Error(`timeline is ${total}s, expected ${FRAMES / FPS}s`);
    for (let f = w; f < FRAMES; f += WORKERS) {
      await shoot(page, f / FPS, path.join(outDir, `frame_${String(f).padStart(4, '0')}.png`));
      if (++done % 90 === 0) console.log(`  ${done}/${FRAMES} frames`);
    }
  } finally {
    await browser.close();
  }
}

await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
console.log(`rendered ${done} frames to ${path.relative(root, outDir)} with ${WORKERS} worker(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
