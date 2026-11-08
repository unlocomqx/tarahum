import { describe, expect, test } from "bun:test";
import { createActor, SimulatedClock } from "xstate";
import type { Posture } from "./posture";
import { rakaatMachine } from "./rakaatMachine";

const FRAME_MS = 33;

function setup(minHoldMs = 400) {
  const clock = new SimulatedClock();
  const actor = createActor(rakaatMachine, { clock, input: { minHoldMs } }).start();
  const hold = (posture: Posture, ms: number) => {
    for (let t = 0; t < ms; t += FRAME_MS) {
      actor.send({ type: "POSTURE", posture });
      clock.increment(FRAME_MS);
    }
  };
  const run = (steps: [Posture, number][]) => steps.forEach(([p, ms]) => hold(p, ms));
  return { actor, run, ctx: () => actor.getSnapshot().context };
}

const rakah: [Posture, number][] = [
  ["qiyam", 2000],
  ["ruku", 1500],
  ["qiyam", 1000],
  ["sujud", 1500],
  ["jalsa", 1000],
  ["sujud", 1500],
];

describe("rakaatMachine", () => {
  test("full 2-rakah sequence counts 2", () => {
    const { run, ctx } = setup();
    run([...rakah, ...rakah, ["jalsa", 3000]]);
    expect(ctx().rakaat).toBe(2);
    expect(ctx().stable).toBe("jalsa");
  });

  test("single long sujud counts once as one prostration", () => {
    const { actor, run, ctx } = setup();
    run([["qiyam", 1000], ["ruku", 1000], ["sujud", 10000]]);
    expect(ctx().rakaat).toBe(0);
    expect(actor.getSnapshot().value).toMatchObject({ rakah: "awaitSujud2" });
    run([["jalsa", 1000], ["sujud", 1000]]);
    expect(ctx().rakaat).toBe(1);
  });

  test("glitch frames shorter than hold are ignored", () => {
    const { actor, run, ctx } = setup();
    run([["qiyam", 1000], ["sujud", 200], ["unknown", 300], ["qiyam", 500]]);
    expect(ctx().stable).toBe("qiyam");
    run([["ruku", 1000], ["jalsa", 150], ["ruku", 500], ["sujud", 1000], ["qiyam", 100], ["sujud", 1000]]);
    expect(ctx().rakaat).toBe(0);
    expect(actor.getSnapshot().value).toMatchObject({ rakah: "awaitSujud2" });
  });

  test("sujud without ruku doesn't count", () => {
    const { run, ctx } = setup();
    run([["qiyam", 1000], ["sujud", 1500], ["jalsa", 1000], ["sujud", 1500], ["jalsa", 1000]]);
    expect(ctx().rakaat).toBe(0);
  });

  test("reset clears count and phase", () => {
    const { actor, run, ctx } = setup();
    run([...rakah, ["ruku", 1000]]);
    actor.send({ type: "RESET" });
    expect(ctx()).toMatchObject({ rakaat: 0, stable: null, candidate: null });
    expect(actor.getSnapshot().value).toEqual({ detector: "idle", rakah: "awaitRuku" });
  });
});
