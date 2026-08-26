import {
  BODY_CENTER_EMA,
  BODY_DEADZONE,
  BODY_LEAN_RATE,
  BODY_STEER_RANGE,
} from "../constants";

export interface BodyCenter {
  x: number;
  y: number;
}

export interface BodySteerResult {
  center: BodyCenter;
  rest: BodyCenter;
  steerX: number;
  steerY: number;
  leanX: number;
  leanY: number;
  aligned: boolean;
}

type RawLandmark = { x: number; y: number; visibility?: number };

function vis(lm: RawLandmark): number {
  return lm.visibility ?? 1;
}

/** Shoulders first; hips only if both are visible (laptop cameras often crop them). */
export function getBodyCenter(
  landmarks: RawLandmark[] | null,
): BodyCenter | null {
  if (!landmarks) return null;

  const ls = landmarks[11];
  const rs = landmarks[12];
  if (!ls || !rs || vis(ls) < 0.35 || vis(rs) < 0.35) return null;

  let x = (ls.x + rs.x) / 2;
  let y = (ls.y + rs.y) / 2;

  const lh = landmarks[23];
  const rh = landmarks[24];
  if (lh && rh && vis(lh) >= 0.35 && vis(rh) >= 0.35) {
    x = x * 0.65 + ((lh.x + rh.x) / 2) * 0.35;
    y = y * 0.65 + ((lh.y + rh.y) / 2) * 0.35;
  }

  return { x, y };
}

/** True when both arms are out near shoulder height. */
export function isTPose(landmarks: RawLandmark[] | null): boolean {
  if (!landmarks) return false;
  const ls = landmarks[11];
  const rs = landmarks[12];
  const lw = landmarks[15];
  const rw = landmarks[16];
  if (!ls || !rs || !lw || !rw) return false;
  if (vis(ls) < 0.35 || vis(rs) < 0.35 || vis(lw) < 0.35 || vis(rw) < 0.35) {
    return false;
  }

  const shoulderWidth = Math.abs(rs.x - ls.x) || 0.2;
  const leftOut = Math.abs(lw.x - ls.x) > shoulderWidth * 0.5;
  const rightOut = Math.abs(rw.x - rs.x) > shoulderWidth * 0.5;
  const leftLevel = Math.abs(lw.y - ls.y) < 0.14;
  const rightLevel = Math.abs(rw.y - rs.y) < 0.14;
  return leftOut && rightOut && leftLevel && rightLevel;
}

function applyDeadzone(v: number, zone: number): number {
  const mag = Math.abs(v);
  if (mag < zone) return 0;
  const signed = (mag - zone) / (1 - zone);
  return Math.sign(v) * Math.min(1, signed);
}

/**
 * Hold-to-move steering. Lean off the calibrated rest pose to slide the bird.
 * Webcam preview is CSS-mirrored: lean toward the left of the panel sends the bird left.
 */
export class BodySteering {
  restX = 0.5;
  restY = 0.5;
  offsetX = 0;
  offsetY = 0;
  hasRest = false;
  private smoothX = 0.5;
  private smoothY = 0.5;
  private hasSmooth = false;

  reset(): void {
    this.restX = 0.5;
    this.restY = 0.5;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hasRest = false;
    this.smoothX = 0.5;
    this.smoothY = 0.5;
    this.hasSmooth = false;
  }

  setOffset(x: number, y: number): void {
    this.offsetX = clamp(x, -1, 1);
    this.offsetY = clamp(y, -1, 1);
  }

  captureRest(landmarks: RawLandmark[] | null): void {
    const center = getBodyCenter(landmarks);
    if (!center) return;
    this.restX = center.x;
    this.restY = center.y;
    this.smoothX = center.x;
    this.smoothY = center.y;
    this.hasSmooth = true;
    this.hasRest = true;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  preview(landmarks: RawLandmark[] | null): BodySteerResult | null {
    return this.sample(landmarks, 0, false);
  }

  tick(dt: number, landmarks: RawLandmark[] | null): BodySteerResult | null {
    return this.sample(landmarks, dt, true);
  }

  private sample(
    landmarks: RawLandmark[] | null,
    dt: number,
    accumulate: boolean,
  ): BodySteerResult | null {
    const raw = getBodyCenter(landmarks);
    if (!raw) return null;

    if (!this.hasSmooth) {
      this.smoothX = raw.x;
      this.smoothY = raw.y;
      this.hasSmooth = true;
    } else {
      const a = 1 - Math.exp(-BODY_CENTER_EMA * Math.max(dt, 1 / 60));
      this.smoothX += (raw.x - this.smoothX) * a;
      this.smoothY += (raw.y - this.smoothY) * a;
    }

    const center = { x: this.smoothX, y: this.smoothY };
    const dx = center.x - this.restX;
    const dy = center.y - this.restY;

    // Webcam preview is CSS-mirrored. Lean toward the left of the panel raises raw x.
    // Chase cam looks down +Z, so world +X is screen left (same as keyboard A).
    const zone = BODY_DEADZONE / BODY_STEER_RANGE;
    const leanX = applyDeadzone(dx / BODY_STEER_RANGE, zone);
    const leanY = applyDeadzone(-dy / BODY_STEER_RANGE, zone);

    if (accumulate && dt > 0) {
      this.offsetX = clamp(this.offsetX + leanX * BODY_LEAN_RATE * dt, -1, 1);
      this.offsetY = clamp(this.offsetY + leanY * BODY_LEAN_RATE * dt, -1, 1);
    }

    const aligned = Math.hypot(dx, dy) < BODY_DEADZONE * 1.35;

    return {
      center,
      rest: { x: this.restX, y: this.restY },
      steerX: this.offsetX,
      steerY: this.offsetY,
      leanX,
      leanY,
      aligned,
    };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
