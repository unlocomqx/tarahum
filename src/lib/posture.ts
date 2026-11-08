import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type Posture = "qiyam" | "ruku" | "sujud" | "jalsa" | "unknown";

export interface Measurement {
  side: "left" | "right";
  torso: number;
  knee: number;
  headBelowHip: boolean;
}

const SIDES = {
  left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
} as const;
const NOSE = 0;
const MIN_VISIBILITY = 0.5;

const deg = (rad: number) => (rad * 180) / Math.PI;

function angleAt(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark, aspect: number) {
  const v1x = (a.x - b.x) * aspect, v1y = a.y - b.y;
  const v2x = (c.x - b.x) * aspect, v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

export function measure(lm: NormalizedLandmark[], aspect = 1): Measurement | null {
  if (lm.length < 29) return null;
  const score = (s: keyof typeof SIDES) =>
    Object.values(SIDES[s]).reduce((sum, i) => sum + (lm[i].visibility ?? 0), 0);
  const side = score("left") >= score("right") ? "left" : "right";
  const idx = SIDES[side];
  const shoulder = lm[idx.shoulder], hip = lm[idx.hip];
  if ((shoulder.visibility ?? 0) < MIN_VISIBILITY || (hip.visibility ?? 0) < MIN_VISIBILITY) return null;

  const dx = (shoulder.x - hip.x) * aspect, dy = shoulder.y - hip.y;
  const torso = deg(Math.acos(-dy / (Math.hypot(dx, dy) || 1)));
  const knee = angleAt(hip, lm[idx.knee], lm[idx.ankle], aspect);
  return { side, torso, knee, headBelowHip: lm[NOSE].y > hip.y };
}

export function classifyMeasurement(m: Measurement | null): Posture {
  if (!m) return "unknown";
  const { torso, knee, headBelowHip } = m;
  if (headBelowHip && knee < 120) return "sujud";
  if (torso >= 55 && torso <= 125 && knee > 140) return "ruku";
  if (torso < 35 && knee > 150) return "qiyam";
  if (torso < 45 && knee < 110) return "jalsa";
  return "unknown";
}

export function classify(lm: NormalizedLandmark[], aspect = 1): Posture {
  return classifyMeasurement(measure(lm, aspect));
}
