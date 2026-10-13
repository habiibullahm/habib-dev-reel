# Muhammad Habiibullah — 30s hype video

A 30-second vertical (9:16, 720×1280, 30 fps) hype video for **Muhammad Habiibullah, AI & Full-Stack Engineer**, made entirely in HTML/CSS/JS. Every frame is rendered from a single self-contained HTML file by headless Chrome, and the frames are stitched with ffmpeg over an original synth loop that is generated sample-by-sample in Node.

No stock footage, no After Effects, no generated faces, no voiceover, no third-party music. The only image is the portrait `habib-profile.webp`.

Final output: [`out/habib-hype.mp4`](out/habib-hype.mp4) (H.264 + AAC, faststart, ~4 MB).

## Quick start

Requirements: Node 22, Google Chrome at `/usr/local/bin/google-chrome` (override with `CHROME_PATH`), ffmpeg with libx264.

```bash
npm install
npm run video        # build → audio → review/audit → frames → stitch
npm run preview      # http://127.0.0.1:47123/hype.html (plays live and loops)
```

| Script | What it does |
| --- | --- |
| `npm run build` | Inlines the Plus Jakarta Sans (500/700/800) and JetBrains Mono (500/700) woff2 files as base64 `@font-face` rules, turning `src/hype.src.html` into the self-contained `hype.html`. It fails if any external reference other than `./habib-profile.webp` remains. |
| `npm run audio` | Synthesizes `out/habib-hype.wav` (30 s, 44.1 kHz, 16-bit stereo, peak −1 dBFS). |
| `npm run review` | Screenshots each scene when it is fully built (0.4 s before its exit) to `out/review/scene-N.png` and runs the layout audit. Exits non-zero on any issue. |
| `npm run frames` | Renders `out/frames/frame_0000.png` … `frame_0899.png` (t = f/30) using parallel headless Chrome workers (`WORKERS=n` to override). |
| `npm run stitch` | Runs `scripts/stitch.sh`, which muxes the frames and the WAV into `out/habib-hype.mp4`. |
| `npm run preview` | Dependency-free static server for the repo root on port 47123 (`PORT` and `HOST` can be overridden). |

### The ffmpeg command (`scripts/stitch.sh`)

```bash
ffmpeg -y -thread_queue_size 512 -framerate 30 -i out/frames/frame_%04d.png \
  -i out/habib-hype.wav -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 44100 \
  -t 30 -movflags +faststart out/habib-hype.mp4
```

## How it works

### `hype.html`: a deterministic timeline

The stage is a fixed 720×1280 `#stage`. Nothing animates on wall-clock time: there are no CSS animations or transitions. `window.renderAt(t)` (t in seconds, 0–30) sets every element's opacity, transform, typed text, caret, flip state, check-mark stroke, particle position and grid offset as a pure function of `t`.

- **Open normally** to play live via `requestAnimationFrame` and loop. The stage is scaled to fit the window.
- **`?t=12.5`** freezes the composition at that time.
- **`?render=1`** is render mode: no scaling, no rAF, and the capture script drives `renderAt`. The page exposes `window.hypeReady`, which resolves after the fonts load and the images decode, plus `window.HYPE` with the timeline constants.

Animations are declared in the markup:

- `data-a="fx start dur"` is a single entrance, using one of `up`, `left`, `pop` (overshoot), `zoom` or `fade`. Times are relative to the scene start.
- `data-stagger="fx start dur step"` applies the same entrance to each child, offset by `step`. Chips and cards use an 80 ms step.
- `data-type="start perChar caretLead"` is a typewriter with a block caret. The untyped remainder is kept invisible so that the line never reflows while it types.
- `data-flip="start dur"` is a 3D `rotateX` flip from an outline pill to a solid yellow pill with dark text.
- `data-draw="start dur"` draws an SVG stroke (the check marks).

Each scene is `display:none` outside its window, and it fades and slides out over its last 0.3 s. Only one scene is ever visible.

### Timeline (120 BPM: one bar = 2 s, so every cut lands on a bar line)

| # | Time | Scene |
| --- | --- | --- |
| 1 | 0–4 s | A terminal types `> build --ai`, then the hook: "Cari engineer yang bisa bangun aplikasi dan **AI** sampai **production**?" |
| 2 | 4–8 s | On the drop, the photo pops in (scale overshoot) inside a yellow frame. "Halo, saya **Muhammad Habiibullah**", then typed: "AI & Full-Stack Engineer · Jakarta". |
| 3 | 8–12 s | "Yang saya **bangun**". Four staggered cards: Product, Applied AI, Backend and Data, each with its tech chips. |
| 4 | 12–16 s | "**End-to-end.**" A 2×2 grid: Backend, Web, Mobile, Delivery. |
| 5 | 16–20 s | "Tech stack" / "Yang saya pakai sehari-hari". Eleven pills, four of which flip to yellow. |
| 6 | 20–24 s | "Fokus sekarang" / "**AI** & Full-Stack Engineering". Five project rows, then `habiibullahm.my.id/projects`. |
| 7 | 24–30 s | Round photo, "Open to AI & full-stack roles" pill (flips), "Butuh engineer untuk produkmu? **Yuk!**", yellow `habiibullahm.my.id` button, three checks (Lihat projects, LinkedIn, GitHub), and the footer `github.com/habiibullahm`. |

Yellow is reserved for the words worth remembering: AI, production, the name, "bangun", "End-to-end.", the flipped pills (TypeScript, Spring Boot, RAG, LLMs), the status pill, "Yuk!" and the CTA button. Everything else is white or muted grey.

Background: `#0b0d12`, a faint 48 px grid that scrolls slowly, 26 seeded yellow particles drifting by `t`, a faint `</>` brand mark at the top-left inside the safe area, and thick diagonal yellow bars confined to 136 px top-right and bottom-left corner boxes.

### Audio (`scripts/make-audio.mjs`)

The soundtrack is pure JS synthesis written straight to a 16-bit PCM WAV, with no samples and no dependencies. It runs at 120 BPM in A minor over an Am – F – C – G progression, and the last bar resolves to Am.

- **0–4 s, intro:** a supersaw pad behind a low-pass filter that opens from 280 Hz to 1.4 kHz, offbeat hats, keyboard ticks synced to the typewriter, and a noise riser.
- **4 s, drop (the photo pop):** a sub boom and crash, then a four-on-the-floor kick, claps on beats 2 and 4, and a rolling eighth-note bass sidechained to the kick (the pad is ducked too).
- **8 s onward:** a plucky sixteenth-note arp with a dotted-eighth ping-pong delay, plus ghost hats. A soft whoosh marks each scene cut.
- **28–30 s:** the drums stop after a final kick and crash. The Am pad, bass note and delay tails ring out while the filter closes and the master fades to silence at exactly 30 s.

Mastering is a gentle soft clip followed by peak normalisation to −1 dBFS. The result measures about −14.8 LUFS integrated with no clipped samples, so it sits under the picture.

### QA: `npm run review`

For each scene, the script captures a screenshot of the fully built state and audits every visible text node (using range client rects trimmed to the line box):

- inside the 48 px safe area (x 48–672, y 48–1232)
- computed font size ≥ 16 px
- no overlap between distinct text elements
- no overlap with the corner bars, and the `</>` mark is checked like any other text
- text stays inside its card, pill or button
- no empty or collapsed cards, chips, pills, tiles, rows or buttons, and every box is inside the safe area

It also renders all 900 frame times and asserts that never more than one scene is visible at once.

## Files

```
src/hype.src.html          editable source (fonts injected at build time)
hype.html                  built, self-contained composition (only external ref: ./habib-profile.webp)
habib-profile.webp         portrait
scripts/build-html.mjs     font inlining + external-reference check
scripts/make-audio.mjs     synth loop → out/habib-hype.wav
scripts/review.mjs         per-scene screenshots + layout audit
scripts/render-frames.mjs  900 PNG frames via puppeteer-core
scripts/stitch.sh          ffmpeg mux → out/habib-hype.mp4
scripts/preview-server.mjs static preview server (port 47123)
scripts/lib/               shared browser launcher and in-page audit
out/habib-hype.mp4         final video (committed; frames, WAV and review shots are gitignored)
```
