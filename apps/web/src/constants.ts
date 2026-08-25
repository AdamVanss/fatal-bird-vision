/** Sliding pose-window length; live control reads the latest 1–2 frames */
export const WINDOW_SIZE = 30;

export const UPPER_BODY_LANDMARKS = [
  11, 12, 13, 14, 15, 16, 23, 24, 0, 7, 8, 25, 26,
] as const;

/**
 * Slot (index into the normalized `UPPER_BODY_LANDMARKS` frame) for named
 * joints, derived from the same list so readers stay in sync if it is reordered.
 */
export const LANDMARK_SLOTS = {
  leftShoulder: UPPER_BODY_LANDMARKS.indexOf(11),
  rightShoulder: UPPER_BODY_LANDMARKS.indexOf(12),
  leftElbow: UPPER_BODY_LANDMARKS.indexOf(13),
  rightElbow: UPPER_BODY_LANDMARKS.indexOf(14),
  leftWrist: UPPER_BODY_LANDMARKS.indexOf(15),
  rightWrist: UPPER_BODY_LANDMARKS.indexOf(16),
} as const;

export const GESTURE_CLASSES = [
  "neutral",
  "flap",
  "glide",
  "bank_left",
  "bank_right",
] as const;

export type GestureClass = (typeof GESTURE_CLASSES)[number];

export const FLIGHT = {
  forwardSpeed: 9,
  lateralSpeed: 7,
  verticalSpeed: 7,
  fallSpeed: 3,
  flapLift: 6,
  autoCenterStrength: 1.2,
} as const;

export const TUNNEL = {
  halfWidth: 5.5,
  playHalfWidth: 4.2,
  playHalfHeight: 3.4,
  ringSpacing: 26,
  /**
   * Distance past the LAST RING at which the course finishes. The tunnel
   * geometry runs `ringSpacing` further than that for visuals (the run-out
   * waypoint pushed by courseToTunnelWaypoints), so this knob only moves
   * the finish line — not the visible tunnel.
   */
  finishOverrun: 20,
  /** Catmull-Rom tension for the tunnel spine curve */
  curveTension: 0.35,
  /** World units between decorative tunnel frames */
  frameSpacing: 13,
  guidanceStrengthX: 0.2,
  guidanceStrengthY: 0.25,
} as const;

export const CAMERA = {
  near: 0.1,
  far: 400,
  pixelRatioCap: 2,
} as const;

export const LOOP_MAX_DT = 0.05;

export const SCORING = {
  ringPoints: 100,
  applePoints: 50,
  /** Time bonus base — the course clock; also gates the timeout finish */
  timeBonusBaseSeconds: 120,
  timeBonusPerSecond: 5,
} as const;

export const COLLISION = {
  /** Ring: |dz| under this counts as "through the gate" */
  ringDepth: 2,
  /**
   * Ring: planar distance from the ring's center. The visual torus radius is
   * slightly larger (2.6) — a deliberate grace gap so passes that look inside
   * still count.
   */
  ringRadius: 2.4,
  /**
   * Ring pass only counts once the bird is within this distance of the gate
   * plane, so flying past beside it doesn't trigger while approaching.
   */
  ringPlaneTolerance: 0.5,
  appleRadius: 1.4,
} as const;

export const WORLD = {
  terrainY: -4,
} as const;

export const CALIBRATION_FRAMES = 20;

/**
 * PoseLandmarker build/detect tuning. The CPU fallback fires after
 * `fallbackErrorFrames` consecutive synchronous detect errors — a broken
 * delegate throws every frame, so this trips in a fraction of a second,
 * while a player merely being out of frame never triggers it.
 */
export const POSE_DETECT = {
  minConfidence: 0.35,
  fallbackErrorFrames: 5,
  defaultVideoWidth: 640,
  defaultVideoHeight: 480,
} as const;

export const VISUAL_SKELETON_BONE_COLOR = "#5ecfff";
export const VISUAL_SKELETON_JOINT_COLOR = "#f0c14b";

/**
 * Arm-zone grammar thresholds, in normalized units (1.0 = calibrated shoulder
 * width). An arm is UP/DOWN only when wrist AND elbow clear the same-side
 * shoulder line by more than `margin`; it returns to LEVEL once either joint
 * falls back inside `levelReturn` (hysteresis dead band).
 */
export const POSE_ZONE = {
  margin: 0.06,
  levelReturn: 0.03,
  /** Raised-wrist clearance past the shoulder line → full bank deflection */
  bankFullDeflect: 0.25,
} as const;

/**
 * Flap pump detection: a burst fires when BOTH wrists rise faster than
 * `minRise` (normalized units per frame pair) and `refractoryMs` has elapsed
 * since the last burst; the burst then holds its energy for `holdMs`.
 * Burst energy is clamped to at least 0.85 so every deliberate pump crosses
 * VISUAL_FEATHER_FLAP_THRESHOLD and drives feathers/wind/speed-boost.
 */
export const POSE_PUMP = {
  minRise: 0.02,
  gain: 18,
  holdMs: 190,
  refractoryMs: 240,
} as const;

export const BIRD_MODEL_URL =
  "https://threejs.org/examples/models/gltf/Parrot.glb";

export const VISUAL_BIRD_COLOR = 0x6b8aa8;
export const VISUAL_BIRD_WING_COLOR = 0x46586b;
export const VISUAL_BIRD_BELLY_COLOR = 0xd8cfc0;
export const VISUAL_BIRD_BEAK_COLOR = 0xf4a020;
export const VISUAL_BIRD_EYE_COLOR = 0x1a1a22;

export const VISUAL_RING_COLOR = 0x1a2e28;
export const VISUAL_RING_EMISSIVE = 0x3ecf8e;
export const VISUAL_RING_GLOW = 0x7dffb8;
export const VISUAL_APPLE_COLOR = 0xe74c3c;
export const VISUAL_APPLE_EMISSIVE = 0x8b1a12;

export const VISUAL_GROUND_COLOR = 0x4a7a52;
export const VISUAL_TREE_TRUNK_COLOR = 0x4a3728;
export const VISUAL_TREE_LEAF_COLOR = 0x2d6b4a;

export const VISUAL_PARTICLE_MAX_COUNT = 500;
export const VISUAL_PARTICLE_COUNTS = {
  ring: 40,
  apple: 15,
  feather: 15,
  finish: 80,
  timeout: 50,
  /** particles per frame while moving fast */
  wind: 2,
} as const;
export const VISUAL_PARTICLE_COLORS = {
  wind: 0xbfe3ff,
  ring: 0xffd24a,
  apple: 0xff5a4e,
  featherA: 0x00e5ff,
  featherB: 0xff44dd,
  finish: 0xffd24a,
  timeout: 0x9aa3ad,
} as const;

export const VISUAL_WIND_LIFETIME = 0.5;
export const VISUAL_BURST_LIFETIME = 1.0;
export const VISUAL_FEATHER_LIFETIME = 1.2;

export const VISUAL_FEATHER_FLAP_THRESHOLD = 0.8;
export const VISUAL_FEATHER_COOLDOWN = 0.35;

export const VISUAL_WIND_SPEED_THRESHOLD = 0.45;

export const VISUAL_WIND_INTENSITY_BLEND = {
  flapEnergyWeight: 0.6,
  motionWeight: 0.4,
} as const;

/**
 * Per-pool physics for the point-particle systems (see effects/PointPool).
 * `size` is world-space sprite size; gravity/drag/sway drive ParticlePool.
 */
export const VISUAL_PARTICLE_POOLS = {
  wind: { size: 0.3, gravity: 0, drag: 0.4, sway: 0 },
  burst: { size: 0.24, gravity: -1.2, drag: 1.6, sway: 0 },
  feather: { size: 0.32, gravity: -2.2, drag: 2.2, sway: 0.9 },
  fireTrail: { size: 0.55 },
} as const;

export const VISUAL_BIRD_GLTF_SCALE = 0.038;

export const CAMERA_RIG = {
  offset: { x: 0, y: 1.5, z: -5.5 },
  lookAhead: { x: 0, y: 0, z: 6 },
  /** Per-second lerp base — fraction of remaining distance closed each second */
  smoothingBase: 0.001,
} as const;

/** Lighting — color keyframes over course progress (0 = start, 1 = last ring) */
export const VISUAL_LIGHT_START_COLOR = 0x4488ff;
export const VISUAL_LIGHT_MID_COLOR = 0xff8844;
export const VISUAL_LIGHT_END_COLOR = 0x8844ff;
export const VISUAL_LIGHT_MID_PROGRESS = 0.5;
export const VISUAL_LIGHT_END_PROGRESS = 0.9;
export const VISUAL_LIGHT_TRANSITION_SPEED = 0.5;
export const VISUAL_AMBIENT_INTENSITY = 0.3;

export const VISUAL_LIGHT_SHADOW = {
  sunPosition: { x: 20, y: 40, z: 15 },
  mapSize: 1024,
  cameraNear: 1,
  cameraFar: 80,
  frustumHalfExtent: 30,
} as const;

export const VISUAL_FOG_COLOR = 0x87b8e8;
export const VISUAL_FOG_DENSITY = 0.02;

/** Live-graph volumes/fades; offline synthesis parameters live in AUDIO_SYNTH. */
export const AUDIO = {
  masterVolume: 0.9,
  windVolume: 0.45,
  windFadeInSeconds: 2.0,
  windFadeOutSeconds: 1.2,
  oneShotTailSeconds: 0.1,
} as const;

export const AUDIO_SYNTH = {
  /** Flap: soft feather rush — brown noise through a falling lowpass */
  flap: {
    duration: 0.22,
    noiseStep: 0.06,
    noiseLeak: 0.986,
    filterBase: 0.08,
    filterSweep: 0.55,
    gain: 3.2,
  },
  /** Ring: mellow chime — one clang plus a soft octave hum */
  ring: {
    duration: 1.0,
    clangHz: 440,
    clangDecay: 3,
    clangGain: 0.32,
    humHz: 587,
    humGain: 0.4,
    humDecay: 2.4,
    outGain: 0.5,
  },
  /** Apple: near-silent woody knock */
  apple: { duration: 0.18, knockHz: 180, knockDecay: 26 },
  wind: {
    loopSeconds: 4,
    breezeNoiseStep: 0.02,
    breezeLeak: 0.999,
    breezeFilter: 0.06,
    breezeGain: 2.6,
    gustHz: 0.4,
    gustFloor: 0.8,
    gustDepth: 0.2,
    chirpTimes: [1.7, 2.62, 3.15],
    chirpHz: 1240,
    chirpDecay: 5,
    chirpGain: 0.12,
    chirpTail: 0.42,
    chirpFadeRate: 1.5,
    seamCrossfadeSamples: 2048,
    targetPeak: 0.62,
  },
} as const;

export const COMBO_MAX_MULTIPLIER = 5.0;
export const COMBO_INCREMENT = 0.5;
export const COMBO_IGNITE_MULTIPLIER = 2;

export const COMBO_FLOATING_TEXT_LIFETIME = 1.5;
export const COMBO_TEXT_COLOR = "#ffdd00";
export const COMBO_TEXT_OUTLINE_COLOR = "#1a1a22";
export const COMBO_TEXT_RISE = 2;
export const COMBO_TEXT_WORLD_WIDTH = 3;

export const COMBO_FIRE_TRAIL_MAX_PARTICLES = 200;
/** Particles per second at full intensity (intensity × rate, fractional-accumulated) */
export const COMBO_FIRE_EMIT_RATE = 140;
export const COMBO_FIRE_TRAIL_LIFETIME = 0.8;
/** Hot → cool color ramp over a particle's life, then fades via additive blend */
export const COMBO_FIRE_COLOR_A = 0xff4400;
export const COMBO_FIRE_COLOR_B = 0xffaa00;

/**
 * Wall-contact detection: bird within this margin of the playable bounds
 * (playHalfWidth/playHalfHeight around the tunnel center) counts as scraping
 * the tunnel wall and resets the combo.
 */
export const COMBO_WALL_CONTACT_EPSILON = 0.05;

export const SPEED_BOOST_MULTIPLIER = 1.5;
/** Total boost window (seconds), including the ease-in/out ramps */
export const SPEED_BOOST_DURATION = 2.0;
export const SPEED_BOOST_COOLDOWN = 3.0;
export const SPEED_BOOST_FOV_INCREASE = 15;
/** Shared ease-in/out ramp for speed & FOV — one trapezoid envelope */
export const SPEED_BOOST_RAMP_TIME = 0.5;
/** Flaps cannot trigger a boost during the first second after (re)spawning */
export const SPEED_BOOST_START_GRACE = 1.0;

export const BASE_CAMERA_FOV = 55;
