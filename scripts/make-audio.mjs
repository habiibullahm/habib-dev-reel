import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'out/habib-hype.wav');

const SR = 44100;
const DUR = 30;
const N = SR * DUR;
const BEAT = 60 / 120;
const BAR = 4 * BEAT;
const DROP = 4;
const OUTRO = 28;
const PEAK_DBFS = -1;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const idx = (t) => Math.round(t * SR);
const TAU = Math.PI * 2;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xa11ce);
const noise = () => rand() * 2 - 1;

const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const add = (b, i, l, r = l) => { if (i >= 0 && i < N) { b.L[i] += l; b.R[i] += r; } };
const panLR = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const saw = (ph, dt) => 2 * ph - 1 - polyBlep(ph, dt);
const square = (ph, dt) => (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph + 0.5) % 1, dt);

// Topology-preserving-transform state-variable filter; stays stable under fast cutoff modulation.
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.bp = 0; this.hp = 0; }
  run(x, cutoff, q = 0.707) {
    const g = Math.tan(Math.PI * Math.min(cutoff, SR * 0.45) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
    return v2;
  }
}

// Am – F – C – G, with the last bar resolving back to Am so the outro rings out on the tonic.
const CHORDS = {
  Am: { pad: [57, 60, 64], bass: 33 },
  F: { pad: [53, 57, 60], bass: 29 },
  C: { pad: [55, 60, 64], bass: 36 },
  G: { pad: [55, 59, 62], bass: 31 },
};
const PROGRESSION = ['Am', 'F', 'C', 'G'];
const BARS = DUR / BAR;
const chordAtBar = (b) => CHORDS[b === BARS - 1 ? 'Am' : PROGRESSION[b % 4]];

const drums = bus(), bass = bus(), pad = bus(), arp = bus(), fx = bus(), send = bus();

const kicks = [];
for (let t = DROP; t < OUTRO; t += BEAT) kicks.push(t);
kicks.push(OUTRO);

const duck = new Float32Array(N);
for (const k of kicks) {
  const s = idx(k);
  for (let i = 0; i < SR * 0.45 && s + i < N; i++) {
    const dt = i / SR;
    const env = Math.min(1, dt / 0.004) * Math.exp(-dt / 0.11);
    duck[s + i] = Math.max(duck[s + i], env);
  }
}

function kick(t, gain = 1) {
  const s = idx(t);
  let ph = 0;
  for (let i = 0; i < SR * 0.5; i++) {
    const dt = i / SR;
    const f = 44 + 120 * Math.exp(-dt / 0.028);
    ph += f / SR;
    const body = Math.sin(TAU * ph) * Math.exp(-dt / 0.17);
    const click = i < SR * 0.004 ? noise() * 0.35 * (1 - i / (SR * 0.004)) : 0;
    const v = Math.tanh((body + click) * 1.3) * gain * 0.9;
    add(drums, s + i, v);
  }
}

function hat(t, gain, pan = 0.25) {
  const s = idx(t);
  const f = new SVF();
  const [l, r] = panLR(pan);
  for (let i = 0; i < SR * 0.09; i++) {
    const dt = i / SR;
    f.run(noise(), 9000, 0.9);
    const v = f.hp;
    const e = Math.exp(-dt / 0.022) * gain;
    add(drums, s + i, v * e * l, v * e * r);
  }
}

function clap(t, gain = 0.5) {
  const s = idx(t);
  const f = new SVF();
  for (let i = 0; i < SR * 0.3; i++) {
    const dt = i / SR;
    let e = 0;
    for (const o of [0, 0.011, 0.022]) if (dt >= o) e = Math.max(e, Math.exp(-(dt - o) / 0.007));
    if (dt >= 0.022) e = Math.max(e, 0.55 * Math.exp(-(dt - 0.022) / 0.09));
    f.run(noise(), 1300, 1.4);
    const v = f.bp * e * gain * 1.6;
    add(drums, s + i, v);
    add(send, s + i, v * 0.45);
  }
}

function crash(t, gain = 0.2, len = 1.6) {
  const s = idx(t);
  const fl = new SVF(), fr = new SVF();
  for (let i = 0; i < SR * len; i++) {
    const dt = i / SR;
    const e = Math.exp(-dt / 0.55) * gain;
    fl.run(noise(), 5000); fr.run(noise(), 5000);
    add(fx, s + i, fl.hp * e, fr.hp * e);
    add(send, s + i, fl.hp * e * 0.4, fr.hp * e * 0.4);
  }
}

function boom(t, gain = 0.5) {
  const s = idx(t);
  let ph = 0;
  for (let i = 0; i < SR * 1.6; i++) {
    const dt = i / SR;
    ph += (40 + 30 * Math.exp(-dt / 0.08)) / SR;
    add(fx, s + i, Math.sin(TAU * ph) * Math.exp(-dt / 0.45) * Math.min(1, dt / 0.003) * gain);
  }
}

function riser(t0, t1, gain = 0.22) {
  const f = new SVF();
  for (let i = idx(t0); i < idx(t1); i++) {
    const p = (i / SR - t0) / (t1 - t0);
    f.run(noise(), 350 * Math.pow(20, p), 2.2);
    const e = p * p * gain;
    add(fx, i, f.bp * e * (1 - 0.3 * p), f.bp * e * (0.7 + 0.3 * p));
  }
}

function whoosh(tEnd, len = 0.32, gain = 0.07) {
  const f = new SVF();
  const s = idx(tEnd - len);
  for (let i = 0; i < SR * len; i++) {
    const p = i / (SR * len);
    f.run(noise(), 600 * Math.pow(6, p), 1.6);
    const e = Math.sin(Math.PI * p) ** 2 * gain;
    add(fx, s + i, f.bp * e, f.bp * e);
  }
}

function tick(t, gain = 0.07) {
  const s = idx(t);
  const f = new SVF();
  for (let i = 0; i < SR * 0.025; i++) {
    const dt = i / SR;
    f.run(noise(), 4200, 1.2);
    const v = (f.bp * Math.exp(-dt / 0.003) + Math.sin(TAU * 1900 * dt) * 0.4 * Math.exp(-dt / 0.006)) * gain;
    add(fx, s + i, v);
  }
}

function bassNote(t, midi, len, gain = 0.5) {
  const s = idx(t);
  const f = mtof(midi);
  const lp = new SVF();
  let ph = 0;
  for (let i = 0; i < SR * (len + 0.03); i++) {
    const dt = i / SR;
    ph = (ph + f / SR) % 1;
    const osc = Math.sin(TAU * ph) + 0.4 * saw(ph, f / SR);
    const v = lp.run(osc, 220 + 900 * Math.exp(-dt / 0.05), 0.9);
    const rel = dt > len ? Math.max(0, 1 - (dt - len) / 0.03) : 1;
    const e = Math.min(1, dt / 0.003) * (0.55 + 0.45 * Math.exp(-dt / 0.12)) * rel * gain;
    add(bass, s + i, v * e);
  }
}

function pluck(t, midi, gain, pan) {
  const s = idx(t);
  const f = mtof(midi);
  const dtph = f / SR;
  const lp = new SVF();
  const [l, r] = panLR(pan);
  let ph = 0;
  for (let i = 0; i < SR * 0.32; i++) {
    const dt = i / SR;
    ph = (ph + dtph) % 1;
    const osc = 0.6 * saw(ph, dtph) + 0.4 * square(ph, dtph);
    const v = lp.run(osc, 350 + 4200 * Math.exp(-dt / 0.05), 1.3);
    const e = Math.min(1, dt / 0.002) * Math.exp(-dt / 0.1) * gain;
    add(arp, s + i, v * e * l, v * e * r);
  }
}

function renderPad() {
  const raw = bus();
  for (let b = 0; b < BARS; b++) {
    const chord = chordAtBar(b);
    const t0 = b * BAR;
    const last = b === BARS - 1;
    const len = last ? DUR - t0 : BAR;
    const notes = [...chord.pad, chord.pad[0] - 12];
    notes.forEach((m, v) => {
      const detunes = v === 3 ? [0] : [-0.07, 0, 0.07];
      detunes.forEach((cents, d) => {
        const f = mtof(m + cents);
        const dtph = f / SR;
        const pan = v === 3 ? 0 : (d - 1) * 0.7;
        const [l, r] = panLR(pan);
        let ph = (v * 0.31 + d * 0.17) % 1;
        const level = v === 3 ? 0.5 : 0.2;
        for (let i = 0; i < SR * (len + 0.4); i++) {
          const dt = i / SR;
          ph = (ph + dtph) % 1;
          const osc = v === 3 ? Math.sin(TAU * ph) : saw(ph, dtph);
          const att = Math.min(1, dt / 0.12);
          const rel = dt > len ? Math.max(0, 1 - (dt - len) / 0.4) : 1;
          const e = att * rel * level;
          add(raw, idx(t0) + i, osc * e * l, osc * e * r);
        }
      });
    });
  }
  const fl = new SVF(), fr = new SVF();
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let cutoff;
    if (t < DROP) cutoff = 280 * Math.pow(1400 / 280, t / DROP);
    else if (t < OUTRO) cutoff = 2300 + 500 * Math.sin(TAU * (t - DROP) / (4 * BAR));
    else cutoff = 2300 * Math.pow(500 / 2300, Math.min(1, (t - OUTRO) / 2));
    const sc = 1 - 0.5 * duck[i];
    const l = fl.run(raw.L[i], cutoff, 0.9) * sc;
    const r = fr.run(raw.R[i], cutoff, 0.9) * sc;
    pad.L[i] += l; pad.R[i] += r;
    send.L[i] += l * 0.18; send.R[i] += r * 0.18;
  }
}

function applyDelay(b, time, feedback, wet) {
  const D = Math.round(time * SR);
  const bl = new Float32Array(N), br = new Float32Array(N);
  let dampL = 0, dampR = 0;
  for (let i = 0; i < N; i++) {
    const dl = i >= D ? bl[i - D] : 0;
    const dr = i >= D ? br[i - D] : 0;
    dampL += 0.45 * (dl - dampL);
    dampR += 0.45 * (dr - dampR);
    bl[i] = (b.L[i] + b.R[i]) * 0.5 + dampR * feedback;
    br[i] = dampL * feedback;
    b.L[i] += dl * wet;
    b.R[i] += dr * wet;
    send.L[i] += b.L[i] * 0.12;
    send.R[i] += b.R[i] * 0.12;
  }
}

function reverb(input, wet = 0.28) {
  const out = bus();
  const combs = [1116, 1188, 1277, 1356, 1422, 1491];
  const aps = [556, 441, 341];
  for (const [ch, spread] of [['L', 0], ['R', 23]]) {
    const x = input[ch];
    const y = out[ch];
    for (const len0 of combs) {
      const len = len0 + spread;
      const buf = new Float32Array(len);
      let p = 0, store = 0;
      for (let i = 0; i < N; i++) {
        const o = buf[p];
        store = o * 0.7 + store * 0.3;
        buf[p] = x[i] * 0.015 + store * 0.84;
        y[i] += o;
        p = (p + 1) % len;
      }
    }
    for (const len0 of aps) {
      const len = len0 + spread;
      const buf = new Float32Array(len);
      let p = 0;
      for (let i = 0; i < N; i++) {
        const b = buf[p];
        const o = -y[i] + b;
        buf[p] = y[i] + b * 0.5;
        y[i] = o;
        p = (p + 1) % len;
      }
    }
    for (let i = 0; i < N; i++) y[i] *= wet;
  }
  return out;
}

for (let t = 0.25; t < OUTRO; t += BEAT) hat(t, t < DROP ? 0.16 : 0.2);
for (let t = 8 + BEAT / 4; t < OUTRO; t += BEAT / 2) hat(t, 0.06, -0.3);
for (const k of kicks) kick(k, k === OUTRO ? 1.05 : 1);
for (let t = DROP + BEAT; t < OUTRO; t += 2 * BEAT) clap(t);

for (let t = DROP; t < OUTRO; t += BEAT / 2) {
  const b = Math.floor(t / BAR + 1e-9);
  const step = Math.round((t - b * BAR) / (BEAT / 2));
  bassNote(t, chordAtBar(b).bass + (step === 7 ? 12 : 0), 0.2);
}
bassNote(OUTRO, CHORDS.Am.bass, 1.6, 0.55);

for (let i = 0; i < N; i++) { bass.L[i] *= 1 - 0.85 * duck[i]; bass.R[i] *= 1 - 0.85 * duck[i]; }

const ARP_STEPS = [0, 2, 4, 1, 3, 5, 4, 2];
for (let t = 8, n = 0; t < OUTRO - 1e-9; t += BEAT / 4, n++) {
  const b = Math.floor(t / BAR + 1e-9);
  const pad = chordAtBar(b).pad;
  const sorted = [...pad.map((m) => m + 12), ...pad.map((m) => m + 24)].sort((a, c) => a - c);
  const accent = n % 4 === 0 ? 1 : 0.72;
  pluck(t, sorted[ARP_STEPS[n % 8]], 0.3 * accent, n % 2 ? 0.35 : -0.35);
}
applyDelay(arp, 0.375, 0.42, 0.42);

renderPad();
riser(2, DROP);
boom(DROP, 0.55);
crash(DROP, 0.16);
crash(OUTRO, 0.14);
for (const t of [8, 12, 16, 20, 24]) whoosh(t);

const typed1 = '> build --ai';
for (let k = 1; k <= typed1.length; k++) if (typed1[k - 1] !== ' ') tick(0.35 + k * 0.075);
const typed2 = 'AI & Full-Stack Engineer · Jakarta';
for (let k = 1; k <= typed2.length; k++) if (typed2[k - 1] !== ' ') tick(DROP + 1.0 + k * 0.042, 0.05);

const verb = reverb(send);

const GAINS = { drums: 1.0, bass: 0.55, pad: 0.32, arp: 0.42, fx: 1.0, verb: 0.9 };
const L = new Float32Array(N), R = new Float32Array(N);
const buses = { drums, bass, pad, arp, fx, verb };
for (const [name, b] of Object.entries(buses)) {
  const g = GAINS[name];
  for (let i = 0; i < N; i++) { L[i] += b.L[i] * g; R[i] += b.R[i] * g; }
}

const FADE_OUT_START = 28.3;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = Math.min(1, t / 0.03);
  if (t > FADE_OUT_START) g *= Math.cos((Math.PI / 2) * Math.min(1, (t - FADE_OUT_START) / (DUR - FADE_OUT_START))) ** 2;
  L[i] *= g; R[i] *= g;
}

const peakOf = () => { let p = 0; for (let i = 0; i < N; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; };
let peak = peakOf();
const DRIVE = 0.6;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((L[i] / peak) * DRIVE) / Math.tanh(DRIVE);
  R[i] = Math.tanh((R[i] / peak) * DRIVE) / Math.tanh(DRIVE);
}
peak = peakOf();
const target = Math.pow(10, PEAK_DBFS / 20);
const norm = target / peak;

const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
let sumSq = 0, clipped = 0, maxAbs = 0;
for (let i = 0; i < N; i++) {
  for (const [ch, x] of [[0, L[i]], [1, R[i]]]) {
    const dither = (rand() - rand()) / 32768;
    let s = Math.round((x * norm + dither) * 32767);
    if (s > 32767 || s < -32768) { clipped++; s = Math.max(-32768, Math.min(32767, s)); }
    maxAbs = Math.max(maxAbs, Math.abs(s));
    sumSq += (s / 32768) ** 2;
    pcm.writeInt16LE(s, 44 + i * 4 + ch * 2);
  }
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, pcm);
const db = (x) => (20 * Math.log10(x)).toFixed(2);
console.log(`wrote ${path.relative(root, outFile)}: ${DUR}s, ${SR} Hz, 16-bit stereo, ${N} frames`);
console.log(`peak ${db(maxAbs / 32768)} dBFS, RMS ${db(Math.sqrt(sumSq / (2 * N)))} dBFS, clipped samples: ${clipped}`);
