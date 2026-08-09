import { UPPER_BODY_LANDMARKS } from "../constants";
import type { NormalizedFrame } from "../types";

export class LandmarkNormalizer {
  shoulderScale = 1;
  private calibrated = false;

  normalize(
    landmarks: Array<{ x: number; y: number; z: number; visibility?: number }>,
  ): NormalizedFrame | null {
    const ls = landmarks[11];
    const rs = landmarks[12];
    if (!ls || !rs || (ls.visibility ?? 1) < 0.25 || (rs.visibility ?? 1) < 0.25) {
      return null;
    }

    const cx = (ls.x + rs.x) / 2;
    const cy = (ls.y + rs.y) / 2;
    const cz = (ls.z + rs.z) / 2;
    const scale =
      this.calibrated && this.shoulderScale > 0
        ? this.shoulderScale
        : Math.hypot(rs.x - ls.x, rs.y - ls.y, rs.z - ls.z) || 1;

    const out = new Float32Array(UPPER_BODY_LANDMARKS.length * 3);
    UPPER_BODY_LANDMARKS.forEach((idx, i) => {
      const lm = landmarks[idx];
      out[i * 3] = (lm.x - cx) / scale;
      out[i * 3 + 1] = (lm.y - cy) / scale;
      out[i * 3 + 2] = (lm.z - cz) / scale;
    });

    return { landmarks: out, timestamp: performance.now() };
  }

  calibrate(landmarks: Float32Array): void {
    const lsX = landmarks[0];
    const lsY = landmarks[1];
    const rsX = landmarks[3];
    const rsY = landmarks[4];
    const width = Math.hypot(rsX - lsX, rsY - lsY);
    if (width > 0.05) {
      this.shoulderScale = width;
      this.calibrated = true;
    }
  }

  /** Raw landmarks for overlay drawing */
  static getRawLandmarks(
    landmarks: Array<{ x: number; y: number; z: number }>,
  ): Array<{ x: number; y: number; z: number }> {
    return UPPER_BODY_LANDMARKS.map((i) => landmarks[i]).filter(Boolean);
  }
}
