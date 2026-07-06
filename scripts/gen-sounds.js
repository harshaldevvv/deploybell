// Synthesizes the built-in notification sounds as WAV files — no binary audio
// assets to hand-manage and no dependencies. Run: `npm run sounds`.
//
// Each sound is additive-synthesized (sine partials + a fast-attack /
// exponential-decay envelope), then peak-normalized so it is loud and clear.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "sounds");
mkdirSync(OUT_DIR, { recursive: true });

const SR = 44100; // sample rate

// Render a list of notes into a normalized mono Float32Array.
// note = { freq, start, dur, gain?, decay?, partials? }
function render(notes) {
  const total = Math.max(...notes.map((n) => n.start + n.dur));
  const len = Math.ceil(total * SR) + SR * 0.02;
  const out = new Float32Array(len);

  for (const n of notes) {
    const partials = n.partials || [1, 0.5, 0.25];
    const partialSum = partials.reduce((a, b) => a + b, 0);
    const decay = n.decay ?? 6;
    const gain = n.gain ?? 0.6;
    const s0 = Math.floor(n.start * SR);
    const s1 = Math.floor((n.start + n.dur) * SR);

    for (let i = s0; i < s1 && i < len; i++) {
      const t = (i - s0) / SR;
      // 5 ms attack, exponential decay.
      const env = Math.min(1, t / 0.005) * Math.exp(-t * decay);
      let v = 0;
      for (let p = 0; p < partials.length; p++) {
        v += partials[p] * Math.sin(2 * Math.PI * n.freq * (p + 1) * t);
      }
      out[i] += (gain * env * v) / partialSum;
    }
  }

  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= norm;
  return out;
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  const file = join(OUT_DIR, name);
  writeFileSync(file, buf);
  console.log(`wrote ${file} (${buf.length} bytes)`);
}

// Bell-like partials for a pleasant, modern chime.
const BELL = [1, 0.6, 0.35, 0.18, 0.08];

// --- Success: bright ascending major arpeggio (C5 E5 G5 C6) ---------------
writeWav(
  "success.wav",
  render([
    { freq: 523.25, start: 0.0, dur: 0.5, decay: 5, partials: BELL },
    { freq: 659.25, start: 0.12, dur: 0.5, decay: 5, partials: BELL },
    { freq: 783.99, start: 0.24, dur: 0.5, decay: 5, partials: BELL },
    { freq: 1046.5, start: 0.36, dur: 0.7, decay: 4, partials: BELL },
  ])
);

// --- Failure: low descending two-tone buzzer ------------------------------
writeWav(
  "failure.wav",
  render([
    { freq: 233.08, start: 0.0, dur: 0.35, decay: 7, gain: 0.8, partials: [1, 0.8, 0.6, 0.4] },
    { freq: 174.61, start: 0.28, dur: 0.6, decay: 5, gain: 0.85, partials: [1, 0.8, 0.6, 0.4] },
  ])
);

// --- Cancelled: neutral falling two-tone ----------------------------------
writeWav(
  "cancelled.wav",
  render([
    { freq: 440.0, start: 0.0, dur: 0.32, decay: 6, partials: [1, 0.5, 0.25] },
    { freq: 329.63, start: 0.26, dur: 0.5, decay: 6, partials: [1, 0.5, 0.25] },
  ])
);

// --- Extras (selectable in Options) ---------------------------------------

// Bright single chime.
writeWav(
  "chime.wav",
  render([{ freq: 1046.5, start: 0, dur: 0.9, decay: 4, partials: BELL }])
);

// Short high ding.
writeWav(
  "ding.wav",
  render([{ freq: 1567.98, start: 0, dur: 0.5, decay: 8, partials: [1, 0.5, 0.2] }])
);

// Loud triple alert.
writeWav(
  "alert.wav",
  render(
    [0.0, 0.18, 0.36].map((start) => ({
      freq: 880,
      start,
      dur: 0.16,
      gain: 0.9,
      decay: 11,
      partials: [1, 0.7, 0.5, 0.3],
    }))
  )
);
