import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import {
  POSE_DETECT,
  VISUAL_SKELETON_BONE_COLOR,
  VISUAL_SKELETON_JOINT_COLOR,
} from "../constants";
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

/**
 * Consecutive `detectForVideo` throws tolerated before rebuilding the
 * landmarker on the CPU delegate (see POSE_DETECT.fallbackErrorFrames).
 */
const MAX_DETECT_ERROR_STREAK = POSE_DETECT.fallbackErrorFrames;

export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private readonly normalizer = new LandmarkNormalizer();
  readonly buffer = new LandmarkBuffer();
  private lastTimestamp = -1;
  private detectErrorStreak = 0;
  private delegate: "GPU" | "CPU" = "GPU";
  private fallbackInProgress = false;

  lastRawLandmarks: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }> | null = null;

  tracking = false;

  async init(): Promise<void> {
    this.landmarker = await this.buildLandmarker("GPU");
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  private async buildLandmarker(delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: POSE_DETECT.minConfidence,
      minPosePresenceConfidence: POSE_DETECT.minConfidence,
      minTrackingConfidence: POSE_DETECT.minConfidence,
    });
  }

  private async fallbackToCpu(): Promise<void> {
    if (this.delegate === "CPU" || this.fallbackInProgress) return;
    this.fallbackInProgress = true;
    console.warn("Pose GPU delegate failed repeatedly — falling back to CPU");
    try {
      // Build first, swap second: the render loop keeps calling detect()
      // during the await, so the old instance must stay live until replaced.
      const cpu = await this.buildLandmarker("CPU");
      this.landmarker?.close();
      this.landmarker = cpu;
      this.delegate = "CPU";
      this.detectErrorStreak = 0;
    } catch (err) {
      console.error("PoseDetector: CPU fallback failed — pose tracking disabled.", err);
    } finally {
      this.fallbackInProgress = false;
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseFrame | null {
    if (!this.landmarker || video.readyState < 2) return null;

    const ts = Math.max(timestampMs, this.lastTimestamp + 1);
    this.lastTimestamp = ts;

    let result;
    try {
      result = this.landmarker.detectForVideo(video, ts);
    } catch {
      this.detectErrorStreak += 1;
      if (this.detectErrorStreak >= MAX_DETECT_ERROR_STREAK) {
        void this.fallbackToCpu();
      }
      return null;
    }
    this.detectErrorStreak = 0;

    if (!result.landmarks.length) {
      this.lastRawLandmarks = null;
      this.tracking = false;
      return null;
    }

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

  calibrateFromFrame(frame: PoseFrame): void {
    if (!frame.normalized) return;
    this.normalizer.calibrate(frame.normalized.landmarks);
  }
}

export class SkeletonOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly drawingUtils: DrawingUtils;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.drawingUtils = new DrawingUtils(this.ctx);
  }

  resize(video: HTMLVideoElement): void {
    const w = video.videoWidth || POSE_DETECT.defaultVideoWidth;
    const h = video.videoHeight || POSE_DETECT.defaultVideoHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(
    video: HTMLVideoElement,
    landmarks: Array<{ x: number; y: number; z?: number }> | null,
  ): void {
    this.resize(video);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!landmarks) return;

    this.drawingUtils.drawConnectors(
      landmarks as never,
      PoseLandmarker.POSE_CONNECTIONS,
      { color: VISUAL_SKELETON_BONE_COLOR, lineWidth: 3 },
    );
    this.drawingUtils.drawLandmarks(landmarks as never, {
      color: VISUAL_SKELETON_JOINT_COLOR,
      lineWidth: 1,
      radius: 5,
    });
  }
}
