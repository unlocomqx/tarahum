# tarahum

> tarāhum rukkaʿan sujjadan — you see them bowing and prostrating (Quran 48:29)

Browser prototype that counts prayer rakaat from the device camera.

## How it works

SvelteKit (SPA via adapter-static) + MediaPipe Pose Landmarker + XState v5.

1. `src/lib/posture.ts` — classifies MediaPipe Pose landmarks into `qiyam`, `ruku`, `sujud`, `jalsa` or `unknown` from the more visible body side (torso angle from vertical, knee angle, head below hips).
2. `src/lib/rakaatMachine.ts` — XState v5 parallel machine:
   - `detector` debounces raw postures and raises `STABLE` once a posture holds for `minHoldMs`.
   - `rakah` follows ruku → sujud → sujud and counts one rakah.
3. `src/lib/camera.ts` — camera, detection loop, skeleton overlay.
4. `src/routes/+page.svelte` — counter, posture, phase, hold slider, reset, live angles.

## Run

```sh
bun install
bun run dev
bun run check
bun run test
```

Add `?inspect` to the URL to open the Stately inspector.

## Camera placement

- Place the phone to the side of the user (profile view), about 2–3 m away.
- Keep it low (floor to knee height) so sujud is fully visible.
- The whole body must stay in frame in every posture.
- Use good, even light.

## Thresholds

Starting values in `src/lib/posture.ts`:

| Posture | Rule |
| --- | --- |
| sujud | head below hip and knee < 120° |
| ruku | torso 55–125° and knee > 140° |
| qiyam | torso < 35° and knee > 150° |
| jalsa | torso < 45° and knee < 110° |

These are first guesses. Tune them on real recordings with the debug overlay and the hold slider.
