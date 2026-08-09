import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import type { NormalizedFrame } from "../types";
import { LandmarkNormalizer } from "./LandmarkNormalizer";
import { LandmarkBuffer } from "./LandmarkBuffer";

export interface PoseFrame {
  normalized: NormalizedFrame | null;
  rawLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }>;
}

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private readonly normalizer = new LandmarkNormalizer();
  readonly buffer = new LandmarkBuffer();
  private lastTimestamp = -1;
  private emptyFrameStreak = 0;
  private delegate: "GPU" | "CPU" = "GPU";

  lastRawLandmarks: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }> | null = null;

  tracking = false;

  async init(): Promise<void> {
    await this.createLandmarker("GPU");
  }

  private async createLandmarker(delegate: "GPU" | "CPU"): Promise<void> {
    this.delegate = delegate;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.35,
      minPosePresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    });
  }

  private async fallbackToCpu(): Promise<void> {
    if (this.delegate === "CPU") return;
    console.warn("Pose GPU delegate failed — falling back to CPU");
    this.landmarker?.close();
    await this.createLandmarker("CPU");
    this.emptyFrameStreak = 0;
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseFrame | null {
    if (!this.landmarker || video.readyState < 2) return null;

    const ts = Math.max(timestampMs, this.lastTimestamp + 1);
    if (ts === this.lastTimestamp) return null;
    this.lastTimestamp = ts;

    const result = this.landmarker.detectForVideo(video, ts);
    if (!result.landmarks.length) {
      this.lastRawLandmarks = null;
      this.tracking = false;
      this.emptyFrameStreak += 1;
      if (this.emptyFrameStreak > 90) void this.fallbackToCpu();
      return null;
    }

    this.emptyFrameStreak = 0;
    const raw = result.landmarks[0];
    this.lastRawLandmarks = raw;
    this.tracking = true;

    const normalized = this.normalizer.normalize(raw);
    if (normalized) this.buffer.push(normalized);

    return { normalized, rawLandmarks: raw };
  }

  /** Prefer video clock — more reliable with MediaPipe VIDEO mode */
  detectFromVideo(video: HTMLVideoElement): PoseFrame | null {
    return this.detect(video, video.currentTime * 1000);
  }

  getWindow(): Float32Array | null {
    return this.buffer.getWindow();
  }

  calibrateFromFrame(frame: PoseFrame): void {
    if (!frame.normalized) return;
    this.normalizer.calibrate(frame.normalized.landmarks);
  }

  getScale(): number {
    return this.normalizer.shoulderScale;
  }
}

export class SkeletonOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private drawingUtils: DrawingUtils | null = null;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.drawingUtils = new DrawingUtils(this.ctx);
  }

  resize(video: HTMLVideoElement): void {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(
    video: HTMLVideoElement,
    landmarks: Array<{ x: number; y: number; z?: number }> | null,
    bodyCenter: { x: number; y: number } | null = null,
    aligned = false,
  ): void {
    this.resize(video);

    if (!landmarks || !this.drawingUtils) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawingUtils.drawConnectors(
      landmarks as never,
      PoseLandmarker.POSE_CONNECTIONS,
      { color: "#5ecfff", lineWidth: 3 },
    );
    this.drawingUtils.drawLandmarks(landmarks as never, {
      color: "#f0c14b",
      lineWidth: 1,
      radius: 5,
    });

    if (bodyCenter) {
      const x = bodyCenter.x * this.canvas.width;
      const y = bodyCenter.y * this.canvas.height;
      const r = aligned ? 14 : 11;

      this.ctx.beginPath();
      this.ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      this.ctx.strokeStyle = aligned ? "#3ecf8e" : "#ff6b6b";
      this.ctx.lineWidth = 3;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = aligned ? "rgba(62, 207, 142, 0.85)" : "rgba(255, 107, 107, 0.9)";
      this.ctx.fill();
    }
  }
}
