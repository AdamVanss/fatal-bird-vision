export const WINDOW_SIZE = 30;
/** Minimum frames before ML window is ready (live control uses latest frame immediately) */
export const LIVE_MIN_FRAMES = 2;
export const NUM_JOINTS = 13;
export const FEATURES_PER_JOINT = 3;
export const INPUT_DIM = NUM_JOINTS * FEATURES_PER_JOINT;

/** MediaPipe Pose landmark indices used for upper-body tracking */
export const UPPER_BODY_LANDMARKS = [
  11, 12, 13, 14, 15, 16, 23, 24, 0, 7, 8, 25, 26,
] as const;

export const GESTURE_CLASSES = [
  "neutral",
  "flap",
  "glide",
  "dive",
  "bank_left",
  "bank_right",
] as const;

export type GestureClass = (typeof GESTURE_CLASSES)[number];

/** Slower, more forgiving flight — rail shooter: fixed forward, strafe X/Y */
export const FLIGHT = {
  forwardSpeed: 9,
  lateralSpeed: 7,
  verticalSpeed: 7,
  glideLift: 2,
  gravity: -1.2,
  autoCenterStrength: 1.2,
  terrainClearance: 1.2,
} as const;

export const TUNNEL = {
  halfWidth: 5.5,
  /** Tighter playable bounds — bird cannot escape */
  playHalfWidth: 4.2,
  playHalfHeight: 3.4,
  halfHeight: 4.5,
  ringSpacing: 26,
} as const;

export const SCORING = {
  ringPoints: 100,
  applePoints: 50,
  timeBonusPerSecond: 5,
} as const;

export const CALIBRATION_FRAMES = 20;

/** Normalized screen offset from calibrated center → full steering deflection */
export const BODY_STEER_RANGE = 0.16;

export const BIRD_MODEL_URL =
  "https://threejs.org/examples/models/gltf/Parrot.glb";
