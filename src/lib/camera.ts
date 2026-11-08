import { FilesetResolver } from "@mediapipe/tasks-vision";
import type { Posture } from "./posture";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";

export interface FrameResult {
  posture: Posture;
  readout: string;
}

export interface Detector {
  process(video: HTMLVideoElement, ts: number, ctx: CanvasRenderingContext2D): FrameResult;
  recalibrate?(): void;
  close(): void;
}

export const loadFileset = () => FilesetResolver.forVisionTasks(WASM_URL);
export type Fileset = Awaited<ReturnType<typeof loadFileset>>;

export async function openCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  video.srcObject = stream;
  await video.play();
  const lock = await navigator.wakeLock?.request("screen").catch(() => null);
  return () => {
    stream.getTracks().forEach((t) => t.stop());
    lock?.release();
  };
}

export function runLoop(video: HTMLVideoElement, onFrame: (ts: number) => void) {
  let id = 0;
  let last = -1;
  const loop = () => {
    if (video.currentTime !== last) {
      last = video.currentTime;
      onFrame(performance.now());
    }
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
}
