import { describe, expect, test } from "bun:test";
import { createActor, SimulatedClock } from "xstate";
import { Calibrator, classifyMiddle, lumaStats, type Baseline, type MiddleSignals } from "./middle";
import { rakaatMachine } from "./rakaatMachine";

const base: Baseline = { luma: 120, eyeDist: 0.05 };
const standing: MiddleSignals = { luma: 120, contrast: 40, eyeDist: 0.05 };
const lowered: MiddleSignals = { luma: 110, contrast: 40, eyeDist: 0.09 };
const covered: MiddleSignals = { luma: 20, contrast: 4, eyeDist: null };
const away: MiddleSignals = { luma: 120, contrast: 40, eyeDist: null };

describe("classifyMiddle", () => {
  test("unknown until calibrated", () => {
    expect(classifyMiddle(standing, null, null)).toBe("unknown");
  });

  test("covered frame is sujud even if a face is found", () => {
    expect(classifyMiddle(covered, base, "qiyam")).toBe("sujud");
    expect(classifyMiddle({ ...covered, eyeDist: 0.2 }, base, "qiyam")).toBe("sujud");
  });

  test("dim but textured frame is not covered", () => {
    expect(classifyMiddle({ luma: 70, contrast: 30, eyeDist: 0.05 }, base, null)).toBe("qiyam");
  });

  test("flat frame at 60% light is covered", () => {
    expect(classifyMiddle({ luma: 72, contrast: 5, eyeDist: null }, base, null)).toBe("sujud");
  });

  test("no face and not covered is unknown", () => {
    expect(classifyMiddle(away, base, "qiyam")).toBe("unknown");
  });

  test("lowered head is ruku after qiyam or ruku, jalsa after sujud or jalsa", () => {
    expect(classifyMiddle(lowered, base, null)).toBe("ruku");
    expect(classifyMiddle(lowered, base, "qiyam")).toBe("ruku");
    expect(classifyMiddle(lowered, base, "ruku")).toBe("ruku");
    expect(classifyMiddle(lowered, base, "sujud")).toBe("jalsa");
    expect(classifyMiddle(lowered, base, "jalsa")).toBe("jalsa");
  });

  test("lowered threshold is configurable", () => {
    expect(classifyMiddle(lowered, base, "qiyam", { lowered: 2, cover: 0.4 })).toBe("qiyam");
  });
});

describe("Calibrator", () => {
  test("ignores frames without a face and returns medians", () => {
    const c = new Calibrator(3);
    expect(c.add(away)).toBeNull();
    expect(c.add({ luma: 100, contrast: 30, eyeDist: 0.04 })).toBeNull();
    expect(c.add({ luma: 200, contrast: 30, eyeDist: 0.9 })).toBeNull();
    expect(c.add({ luma: 120, contrast: 30, eyeDist: 0.05 })).toEqual({ luma: 120, eyeDist: 0.05 });
  });
});

test("lumaStats gives mean and contrast", () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const { luma, contrast } = lumaStats(px);
  expect(luma).toBeCloseTo(127.5);
  expect(contrast).toBeCloseTo(127.5);
});

test("middle signals drive the machine through one rakah", () => {
  const clock = new SimulatedClock();
  const actor = createActor(rakaatMachine, { clock, input: {} }).start();
  const hold = (s: MiddleSignals, ms: number) => {
    for (let t = 0; t < ms; t += 33) {
      const stable = actor.getSnapshot().context.stable;
      actor.send({ type: "POSTURE", posture: classifyMiddle(s, base, stable) });
      clock.increment(33);
    }
  };
  hold(standing, 1500);
  hold(lowered, 1500);
  hold(standing, 1000);
  hold(covered, 1500);
  hold(lowered, 1000);
  expect(actor.getSnapshot().context.stable).toBe("jalsa");
  hold(covered, 1500);
  hold(lowered, 3000);
  expect(actor.getSnapshot().context).toMatchObject({ rakaat: 1, stable: "jalsa" });
});
