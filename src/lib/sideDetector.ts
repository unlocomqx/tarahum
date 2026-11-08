import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Detector, Fileset } from "./camera";
import { classifyMeasurement, measure } from "./posture";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export async function createSideDetector(fileset: Fileset): Promise<Detector> {
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  let draw: DrawingUtils | null = null;

  return {
    process(video, ts, ctx) {
      draw ??= new DrawingUtils(ctx);
      const lm = landmarker.detectForVideo(video, ts).landmarks[0];
      if (lm) {
        draw.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: "#4ade80", lineWidth: 3 });
        draw.drawLandmarks(lm, { color: "#f87171", radius: 3 });
      }
      const m = lm ? measure(lm, ctx.canvas.width / ctx.canvas.height) : null;
      const posture = classifyMeasurement(m);
      const readout = m
        ? `side  ${m.side}\ntorso ${m.torso.toFixed(0)}°\nknee  ${m.knee.toFixed(0)}°\nhead<hip ${m.headBelowHip}\nraw   ${posture}`
        : `raw   ${posture}`;
      return { posture, readout };
    },
    close: () => landmarker.close(),
  };
}
