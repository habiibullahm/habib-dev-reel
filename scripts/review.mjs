import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launch, openStage, shoot, root } from './lib/browser.mjs';
import { audit, SAFE, MIN_FONT, TOL } from './lib/audit.mjs';

const outDir = path.join(root, 'out/review');
await mkdir(outDir, { recursive: true });
const browser = await launch();
let failures = 0;
try {
  const page = await openStage(browser);
  const { DURATIONS, STARTS, TOTAL, FPS } = await page.evaluate(() => window.HYPE);

  for (let i = 0; i < DURATIONS.length; i++) {
    const t = +(STARTS[i] + DURATIONS[i] - 0.4).toFixed(3);
    const file = path.join(outDir, `scene-${i + 1}.png`);
    await shoot(page, t, file);
    const res = await page.evaluate(audit, SAFE, MIN_FONT, TOL);
    const status = res.issues.length ? 'FAIL' : 'ok';
    console.log(`scene ${i + 1} @ ${t.toFixed(2)}s  ${status}  (${res.textCount} text nodes, ${res.boxCount} boxes) → ${path.relative(root, file)}`);
    for (const issue of res.issues) console.log(`   - ${issue}`);
    failures += res.issues.length;
  }

  const frameCount = Math.round(TOTAL * FPS);
  const overlaps = await page.evaluate((n, fps) => {
    const bad = [];
    for (let f = 0; f < n; f++) {
      window.renderAt(f / fps);
      const shown = [...document.querySelectorAll('.scene')].filter((s) => getComputedStyle(s).display !== 'none' && parseFloat(getComputedStyle(s).opacity) > 0);
      if (shown.length > 1) bad.push(f);
    }
    return bad;
  }, frameCount, FPS);
  console.log(`scene exclusivity over ${frameCount} frames: ${overlaps.length ? `FAIL at frames ${overlaps.slice(0, 10).join(', ')}` : 'ok (never more than one scene visible)'}`);
  failures += overlaps.length;
} finally {
  await browser.close();
}

console.log(failures ? `\nAUDIT FAILED: ${failures} issue(s)` : '\nAUDIT CLEAN');
process.exit(failures ? 1 : 0);
