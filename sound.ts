"use client";

/* Tiny synthesized sound effects (no audio files). Muting is remembered per browser. */

const KEY = "openskill:muted";
let ctx: AudioContext | null = null;

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function play(fn: () => void) {
  if (isMuted() || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    fn();
  } catch {}
}

export const sfx = {
  correct: () => play(() => { tone(660, 0, 0.14, "triangle"); tone(990, 0.09, 0.22, "triangle"); }),
  wrong: () => play(() => { tone(180, 0, 0.18, "sawtooth", 0.06); tone(140, 0.1, 0.22, "sawtooth", 0.06); }),
  tap: () => play(() => tone(520, 0, 0.06, "sine", 0.05)),
  complete: () => play(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.1))),
  streak: () => play(() => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, "sine", 0.09))),
};
