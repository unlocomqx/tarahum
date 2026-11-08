import type { Posture } from "./posture";
import type { KnownPosture } from "./rakaatMachine";

export interface MiddleSignals {
  luma: number;
  contrast: number;
  eyeDist: number | null;
}

export interface Baseline {
  luma: number;
  eyeDist: number;
}

export interface MiddleThresholds {
  lowered: number;
  cover: number;
}

export const DEFAULT_THRESHOLDS: MiddleThresholds = { lowered: 1.3, cover: 0.4 };

const FLAT_CONTRAST = 8;

export function isCovered(s: MiddleSignals, base: Baseline, t: MiddleThresholds) {
  return s.luma < base.luma * t.cover || (s.contrast < FLAT_CONTRAST && s.luma < base.luma * 0.7);
}

export function classifyMiddle(
  s: MiddleSignals,
  base: Baseline | null,
  stable: KnownPosture | null,
  t: MiddleThresholds = DEFAULT_THRESHOLDS,
): Posture {
  if (!base) return "unknown";
  if (isCovered(s, base, t)) return "sujud";
  if (s.eyeDist === null) return "unknown";
  if (s.eyeDist / base.eyeDist < t.lowered) return "qiyam";
  return stable === "sujud" || stable === "jalsa" ? "jalsa" : "ruku";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export class Calibrator {
  private samples: { luma: number; eyeDist: number }[] = [];
  constructor(readonly size = 30) {}

  get count() {
    return this.samples.length;
  }

  add(s: MiddleSignals): Baseline | null {
    if (s.eyeDist !== null) this.samples.push({ luma: s.luma, eyeDist: s.eyeDist });
    if (this.samples.length < this.size) return null;
    return {
      luma: median(this.samples.map((x) => x.luma)),
      eyeDist: median(this.samples.map((x) => x.eyeDist)),
    };
  }

  reset() {
    this.samples = [];
  }
}

export function lumaStats(rgba: Uint8ClampedArray) {
  const n = rgba.length / 4;
  let sum = 0, sq = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const y = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    sum += y;
    sq += y * y;
  }
  const mean = sum / n;
  return { luma: mean, contrast: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}
