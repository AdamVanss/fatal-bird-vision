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

/** Museum hoop flight: constant forward, body position maps to X/Y */
export const FLIGHT = {
  forwardSpeed: 11,
  followLerp: 6.5,
  gravity: 0,
  autoCenterStrength: 0,
  terrainClearance: 1.2,
} as const;

export const CANYON = {
  playHalfWidth: 8,
  playHalfHeight: 6,
  flightHeight: 14,
  length: 720,
  ringSpacing: 28,
} as const;

/** @deprecated Use CANYON. Kept so older path helpers still compile during rename. */
export const TUNNEL = {
  halfWidth: CANYON.playHalfWidth,
  playHalfWidth: CANYON.playHalfWidth,
  playHalfHeight: CANYON.playHalfHeight,
  halfHeight: CANYON.playHalfHeight,
  ringSpacing: CANYON.ringSpacing,
} as const;

export const SCORING = {
  /** XP for the first ring in a consecutive streak */
  streakBase: 10,
  /** Each extra consecutive hit multiplies the previous award */
  streakGrowth: 1.65,
  timeBonusPerSecond: 2,
} as const;

/** 1-based consecutive hit count. Misses reset the streak to 0 before the next hit. */
export function streakAward(streakIndex: number, multiplier = 1): number {
  if (streakIndex < 1) return 0;
  return Math.round(
    SCORING.streakBase * Math.pow(SCORING.streakGrowth, streakIndex - 1) * multiplier,
  );
}

export const T_POSE_HOLD_SECONDS = 1.1;

/** How fast WASD walks the bird across the play volume (1 = full range per second) */
export const KEYBOARD_STEER_RATE = 0.95;

/** Lean distance (normalized) that maps to full move rate */
export const BODY_STEER_RANGE = 0.12;

/** Ignore tiny pose noise around the calibrated rest pose */
export const BODY_DEADZONE = 0.028;

/** How fast a full lean slides the bird (same units as keyboard rate) */
export const BODY_LEAN_RATE = 0.85;

/** 3D XP popup that rises off the bird after a ring pass */
export const XP_FLOAT_LIFETIME = 1.5;
export const XP_TEXT_COLOR = "#5fd832";
export const XP_TEXT_OUTLINE_COLOR = "#050505";
export const XP_TEXT_RISE = 2;
export const XP_TEXT_WORLD_WIDTH = 3;

/** Body-point smoothing (higher = snappier, lower = calmer) */
export const BODY_CENTER_EMA = 10;

export type DifficultyId = "easy" | "normal" | "hard" | "impossible";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  blurb: string;
  multiplier: number;
  speed: number;
  movingRings: boolean;
  /** 1 = Impossible hunt. Lower = a slow drift. */
  ringMoveRate: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Slow glide. Rings stay still.",
    multiplier: 1,
    speed: 7,
    movingRings: false,
    ringMoveRate: 0,
  },
  normal: {
    id: "normal",
    label: "Normal",
    blurb: "Museum pace. Still rings.",
    multiplier: 1.5,
    speed: 11,
    movingRings: false,
    ringMoveRate: 0,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Fast canyon. Rings drift.",
    multiplier: 2.5,
    speed: 16,
    movingRings: true,
    ringMoveRate: 0.48,
  },
  impossible: {
    id: "impossible",
    label: "Impossible",
    blurb: "Fastest flight. Rings hunt you.",
    multiplier: 4,
    speed: 22,
    movingRings: true,
    ringMoveRate: 1,
  },
};

export const SPEED_BURST_SECONDS = 1.75;
export const SPEED_BURST_EXTRA = 0.7;
export const SPEED_GATE_XP = 40;
export const TRACKING_LOST_DELAY = 0.28;

export const PLAYER_NAME_MAX = 24;

export type BirdSkinId = "macaw" | "indigo" | "gold" | "night" | "flamingo" | "stork";

export interface BirdSkin {
  id: BirdSkinId;
  name: string;
  url: string;
  /** Recolors vertex colors. Hue is a 0-1 rotation. Color multiplies the mesh. */
  tint?: { hue?: number; sat?: number; lit?: number; color?: number };
}

/** In-flight wingspan. Preview uses height so the menu camera can frame the bird. */
export const BIRD_FLIGHT_SIZE = 6.6;
export const BIRD_PREVIEW_SIZE = 3.15;

export const BIRD_SKINS: BirdSkin[] = [
  { id: "macaw", name: "Scarlet Macaw", url: "/models/birds/Parrot.glb" },
  {
    id: "indigo",
    name: "Indigo Macaw",
    url: "/models/birds/Parrot.glb",
    tint: { hue: 0.62, color: 0x3d6aff },
  },
  {
    id: "gold",
    name: "Sun Macaw",
    url: "/models/birds/Parrot.glb",
    tint: { hue: 0.12, color: 0xffc45c },
  },
  {
    id: "night",
    name: "Night Crow",
    url: "/models/birds/Parrot.glb",
    tint: { sat: 0.04, lit: 0.07, color: 0x121218 },
  },
  { id: "flamingo", name: "Flamingo", url: "/models/birds/Flamingo.glb" },
  { id: "stork", name: "Stork", url: "/models/birds/Stork.glb" },
];
