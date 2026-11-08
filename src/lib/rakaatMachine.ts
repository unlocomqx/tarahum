import { assign, raise, setup } from "xstate";
import type { Posture } from "./posture";

export type KnownPosture = Exclude<Posture, "unknown">;

export interface RakaatContext {
  rakaat: number;
  stable: KnownPosture | null;
  candidate: KnownPosture | null;
  minHoldMs: number;
}

export type RakaatEvent =
  | { type: "POSTURE"; posture: Posture }
  | { type: "STABLE"; posture: KnownPosture }
  | { type: "SET_HOLD"; ms: number }
  | { type: "RESET" };

const isPosture = (event: RakaatEvent, posture: Posture) =>
  (event.type === "POSTURE" || event.type === "STABLE") && event.posture === posture;

export const rakaatMachine = setup({
  types: {
    context: {} as RakaatContext,
    events: {} as RakaatEvent,
    input: {} as { minHoldMs?: number } | undefined,
  },
  delays: {
    hold: ({ context }) => context.minHoldMs,
  },
  guards: {
    isNewKnown: ({ context, event }) =>
      event.type === "POSTURE" && event.posture !== "unknown" && event.posture !== context.stable,
    isStable: ({ context, event }) => event.type === "POSTURE" && event.posture === context.stable,
    isOtherCandidate: ({ context, event }) =>
      event.type === "POSTURE" &&
      event.posture !== "unknown" &&
      event.posture !== context.stable &&
      event.posture !== context.candidate,
    isRuku: ({ event }) => isPosture(event, "ruku"),
    isSujud: ({ event }) => isPosture(event, "sujud"),
  },
  actions: {
    setCandidate: assign({
      candidate: ({ event }) => (event.type === "POSTURE" ? (event.posture as KnownPosture) : null),
    }),
    clearCandidate: assign({ candidate: null }),
    commit: assign({ stable: ({ context }) => context.candidate, candidate: null }),
    raiseStable: raise(({ context }) => ({ type: "STABLE" as const, posture: context.stable! })),
    increment: assign({ rakaat: ({ context }) => context.rakaat + 1 }),
  },
}).createMachine({
  id: "rakaat",
  type: "parallel",
  context: ({ input }) => ({
    rakaat: 0,
    stable: null,
    candidate: null,
    minHoldMs: input?.minHoldMs ?? 400,
  }),
  on: {
    RESET: {
      target: [".detector.idle", ".rakah.awaitRuku"],
      actions: assign({ rakaat: 0, stable: null, candidate: null }),
    },
    SET_HOLD: { actions: assign({ minHoldMs: ({ event }) => event.ms }) },
  },
  states: {
    detector: {
      initial: "idle",
      states: {
        idle: {
          on: {
            POSTURE: { guard: "isNewKnown", target: "confirming", actions: "setCandidate" },
          },
        },
        confirming: {
          after: {
            hold: { target: "idle", actions: ["commit", "raiseStable"] },
          },
          on: {
            POSTURE: [
              { guard: "isStable", target: "idle", actions: "clearCandidate" },
              { guard: "isOtherCandidate", target: "confirming", reenter: true, actions: "setCandidate" },
            ],
          },
        },
      },
    },
    rakah: {
      initial: "awaitRuku",
      states: {
        awaitRuku: { on: { STABLE: { guard: "isRuku", target: "awaitSujud1" } } },
        awaitSujud1: { on: { STABLE: { guard: "isSujud", target: "awaitSujud2" } } },
        awaitSujud2: {
          on: { STABLE: { guard: "isSujud", target: "awaitRuku", actions: "increment" } },
        },
      },
    },
  },
});
