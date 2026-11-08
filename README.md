# tarahum

> tarāhum rukkaʿan sujjadan — you see them bowing and prostrating (Quran 48:29)

Browser prototype that counts prayer rakaat from the device camera.

## How it works

1. `src/lib/rakaatMachine.ts` — XState v5 parallel machine, shared by both placements:
   - `detector` debounces raw postures and raises `STABLE` once a posture holds for `minHoldMs`.
   - `rakah` follows ruku → sujud → sujud and counts one rakah.
2. `src/lib/middle.ts` + `middleDetector.ts` — **Middle** placement (default):
   - Cover signal: mean light and contrast of a tiny thumbnail. Covered → `sujud`.
   - Face signal: MediaPipe Face Detector, eye distance relative to frame size. The face gets bigger as the head comes closer to the phone.
   - Calibration: the first 30 frames with a face (user standing) set the baseline light and face size. Reset recalibrates.
   - Face near baseline → `qiyam`. Face bigger than `lowered` × baseline → `ruku`, or `jalsa` when the last stable posture was `sujud`/`jalsa` (both look the same from below).
   - Rotation search: the phone can lie in any direction, so the detector tries the frame at 0/90/180/270° until it finds a face.
3. `src/lib/posture.ts` + `sideDetector.ts` — **Side** placement: MediaPipe Pose, torso and knee angles from a side profile view.
4. `src/lib/camera.ts` — camera, screen wake lock, frame loop.
5. `src/routes/+page.svelte` — counter, placement switch, posture, phase, sliders, reset, live debug readout.

## Run

```sh
bun install
bun run dev
bun run check
bun run test
```

Add `?inspect` to the URL to open the Stately inspector.

## Camera placement

Target setup: the phone lies flat on the prayer carpet, screen up, so the front camera looks at the ceiling. Two positions:

- **Middle** — in the centre of the carpet, between the standing spot and the sujud spot. The user's body covers the camera in sujud.
- **Side** — on the edge of the carpet, beside the user. The camera sees the user from below and from the side.

The phone's rotation on the carpet is not fixed (portrait or landscape, any direction).

**Middle** mode targets the flat, middle position. **Side** mode still assumes an upright phone with a side profile view (2–3 m away, low height); it does not fit the flat-on-carpet side position yet.

## Thresholds

Middle: `lowered` 1.3 (face size ratio) and `cover` 0.4 (light ratio), tunable with sliders.

Side, in `src/lib/posture.ts`:

| Posture | Rule |
| --- | --- |
| sujud | head below hip and knee < 120° |
| ruku | torso 55–125° and knee > 140° |
| qiyam | torso < 35° and knee > 150° |
| jalsa | torso < 45° and knee < 110° |

These are first guesses. Tune them on real recordings with the debug overlay and the hold slider.
