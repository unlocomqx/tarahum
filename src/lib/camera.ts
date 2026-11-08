import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { classifyMeasurement, measure, type Measurement, type Posture } from "./posture";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface Frame {
  posture: Posture;
  measurement: Measurement | null;
}

export async function startCamera(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onFrame: (frame: Frame) => void,
) {
  const [stream, landmarker] = await Promise.all([
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
    FilesetResolver.forVisionTasks(WASM_URL).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    ),
  ]);
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  const draw = new DrawingUtils(ctx);

  let frameId = 0;
  let lastTime = -1;
  const loop = () => {
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const lm = landmarker.detectForVideo(video, performance.now()).landmarks[0];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (lm) {
        draw.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: "#4ade80", lineWidth: 3 });
        draw.drawLandmarks(lm, { color: "#f87171", radius: 3 });
      }
      const measurement = lm ? measure(lm, canvas.width / canvas.height) : null;
      onFrame({ posture: classifyMeasurement(measurement), measurement });
    }
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frameId);
    stream.getTracks().forEach((t) => t.stop());
    landmarker.close();
  };
}
