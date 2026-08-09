import { BODY_STEER_RANGE } from "../constants";

export interface BodyCenter {
  x: number;
  y: number;
}

export interface BodySteerResult {
  center: BodyCenter;
  /** Horizontal: negative = left, positive = right */
  steerX: number;
  /** Vertical: negative = down, positive = up */
  steerY: number;
  aligned: boolean;
}

type RawLandmark = { x: number; y: number; visibility?: number };

/** Torso midpoint from shoulders + hips (MediaPipe pose indices) */
export function getBodyCenter(
  landmarks: RawLandmark[] | null,
): BodyCenter | null {
  if (!landmarks) return null;

  const ls = landmarks[11];
  const rs = landmarks[12];
  const lh = landmarks[23];
  const rh = landmarks[24];
  if (!ls || !rs || !lh || !rh) return null;

  const vis = (lm: RawLandmark) => lm.visibility ?? 1;
  if (
    vis(ls) < 0.25 ||
    vis(rs) < 0.25 ||
    vis(lh) < 0.25 ||
    vis(rh) < 0.25
  ) {
    return null;
  }

  return {
    x: (ls.x + rs.x + lh.x + rh.x) / 4,
    y: (ls.y + rs.y + lh.y + rh.y) / 4,
  };
}

/** Steer by aligning body center with the fixed camera-center reticle (0.5, 0.5) */
export class BodySteering {
  private readonly targetX = 0.5;
  private readonly targetY = 0.5;

  compute(landmarks: RawLandmark[] | null): BodySteerResult | null {
    const center = getBodyCenter(landmarks);
    if (!center) return null;

    const dx = center.x - this.targetX;
    const dy = center.y - this.targetY;

    const steerX = clamp(-dx / BODY_STEER_RANGE, -1, 1);
    // Screen Y grows downward; invert so moving body up steers bird up
    const steerY = clamp(-dy / BODY_STEER_RANGE, -1, 1);
    const aligned = Math.hypot(dx, dy) < BODY_STEER_RANGE * 0.15;

    return { center, steerX, steerY, aligned };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
