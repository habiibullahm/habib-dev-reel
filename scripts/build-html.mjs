import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'src/hype.src.html');
const outPath = path.join(root, 'hype.html');
const MARKER = '/*@FONTS@*/';

const fonts = [
  { family: 'Plus Jakarta Sans', pkg: 'plus-jakarta-sans', weights: [500, 700, 800] },
  { family: 'JetBrains Mono', pkg: 'jetbrains-mono', weights: [500, 700] },
];

async function fontFaces() {
  const rules = [];
  for (const { family, pkg, weights } of fonts) {
    for (const weight of weights) {
      const file = path.join(root, 'node_modules/@fontsource', pkg, 'files', `${pkg}-latin-${weight}-normal.woff2`);
      const b64 = (await readFile(file)).toString('base64');
      rules.push(
        `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;` +
          `src:url(data:font/woff2;base64,${b64}) format("woff2");}`
      );
    }
  }
  return rules.join('\n');
}

const src = await readFile(srcPath, 'utf8');
if (!src.includes(MARKER)) throw new Error(`Font marker ${MARKER} not found in ${srcPath}`);
const html = src.replace(MARKER, await fontFaces());

// The output must be self-contained: the portrait is the only allowed external reference.
const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g)]
  .map((m) => m[1] ?? m[2])
  .filter((ref) => !ref.startsWith('data:') && !ref.startsWith('#') && ref !== './habib-profile.webp');
if (refs.length) throw new Error(`Unexpected external references in hype.html: ${refs.join(', ')}`);

await writeFile(outPath, html);
console.log(`wrote ${path.relative(root, outPath)} (${(html.length / 1024).toFixed(1)} KiB)`);
