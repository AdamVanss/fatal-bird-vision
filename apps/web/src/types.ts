import type { DifficultyId, GestureClass } from "./constants";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedFrame {
  landmarks: Float32Array;
  timestamp: number;
}

export interface FlightInput {
  flapEnergy: number;
  bank: number;
  pitchIntent: number;
  /** Body offset steering: 0 = tunnel center */
  bodySteerX: number;
  bodySteerY: number;
  gestureClass: GestureClass;
  confidence: number;
  source: "model" | "keyboard" | "heuristic";
}

export interface GestureModelOutput {
  flapEnergy: number;
  bank: number;
  pitchIntent: number;
  classIndex: number;
  classProbabilities: Float32Array;
}

export interface RecordedSample {
  label: GestureClass;
  frames: number[][];
  timestamp: string;
}

export interface CourseStats {
  ringsCollected: number;
  ringsTotal: number;
  elapsedSeconds: number;
  score: number;
  bestStreak: number;
  misses: number;
  boosts: number;
}

export interface PlayerRun {
  name: string;
  difficulty: DifficultyId;
  multiplier: number;
  score: number;
  ringsCollected: number;
  ringsTotal: number;
  elapsedSeconds: number;
  at: string;
}
