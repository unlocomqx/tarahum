import { FaceDetector } from "@mediapipe/tasks-vision";
import type { Detector, Fileset } from "./camera";
import { Calibrator, classifyMiddle, isCovered, lumaStats, type Baseline, type MiddleThresholds } from "./middle";
import type { KnownPosture } from "./rakaatMachine";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const WORK_MAX = 640;
const MISSES_BEFORE_ROTATE = 15;
const SEARCH_MIN_CONTRAST = 15;

type Point = { x: number; y: number };

function unrotate(p: Point, rotation: number): Point {
  if (rotation === 90) return { x: p.y, y: 1 - p.x };
  if (rotation === 180) return { x: 1 - p.x, y: 1 - p.y };
  if (rotation === 270) return { x: 1 - p.y, y: p.x };
  return p;
}

export async function createMiddleDetector(
  fileset: Fileset,
  getState: () => { stable: KnownPosture | null; thresholds: MiddleThresholds },
): Promise<Detector> {
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.5,
  });
  const thumb = new OffscreenCanvas(32, 24);
  const thumbCtx = thumb.getContext("2d", { willReadFrequently: true })!;
  const work = new OffscreenCanvas(1, 1);
  const workCtx = work.getContext("2d")!;
  const calibrator = new Calibrator();
  let baseline: Baseline | null = null;
  let rotation = 0;
  let misses = 0;

  function drawRotated(video: HTMLVideoElement) {
    const scale = Math.min(1, WORK_MAX / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    const swap = rotation % 180 !== 0;
    work.width = swap ? h : w;
    work.height = swap ? w : h;
    workCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (rotation === 90) workCtx.translate(work.width, 0);
    if (rotation === 180) workCtx.translate(work.width, work.height);
    if (rotation === 270) workCtx.translate(0, work.height);
    workCtx.rotate((rotation * Math.PI) / 180);
    workCtx.drawImage(video, 0, 0, w, h);
  }

  return {
    process(video, ts, ctx) {
      thumbCtx.drawImage(video, 0, 0, thumb.width, thumb.height);
      const { luma, contrast } = lumaStats(thumbCtx.getImageData(0, 0, thumb.width, thumb.height).data);

      drawRotated(video);
      const face = detector.detectForVideo(work, ts).detections[0];
      let eyeDist: number | null = null;
      if (face && face.keypoints.length >= 2) {
        misses = 0;
        const [r, l] = face.keypoints;
        eyeDist = Math.hypot((r.x - l.x) * work.width, (r.y - l.y) * work.height) / Math.min(work.width, work.height);
        const { width: W, height: H } = ctx.canvas;
        ctx.fillStyle = "#4ade80";
        for (const k of face.keypoints) {
          const p = unrotate(k, rotation);
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (contrast > SEARCH_MIN_CONTRAST && ++misses > MISSES_BEFORE_ROTATE) {
        misses = 0;
        rotation = (rotation + 90) % 360;
      }

      const signals = { luma, contrast, eyeDist };
      if (!baseline) baseline = calibrator.add(signals);
      const { stable, thresholds } = getState();
      const posture = classifyMiddle(signals, baseline, stable, thresholds);

      const lines = [
        `luma  ${luma.toFixed(0)}${baseline ? ` / ${baseline.luma.toFixed(0)}` : ""}`,
        `contr ${contrast.toFixed(0)}`,
        `eyes  ${eyeDist?.toFixed(3) ?? "—"}${baseline ? ` (×${eyeDist ? (eyeDist / baseline.eyeDist).toFixed(2) : "—"})` : ""}`,
        `rot   ${rotation}°`,
        baseline
          ? `cover ${isCovered(signals, baseline, thresholds)}`
          : `calibrating ${calibrator.count}/${calibrator.size} — stand facing the phone`,
        `raw   ${posture}`,
      ];
      return { posture, readout: lines.join("\n") };
    },
    recalibrate() {
      baseline = null;
      calibrator.reset();
    },
    close: () => detector.close(),
  };
}
