import type { GestureClass } from "./constants";

export interface NormalizedFrame {
  landmarks: Float32Array;
  timestamp: number;
}

export interface FlightInput {
  flapEnergy: number;
  /** Lateral command: −1 = slide screen-left, +1 = slide screen-right */
  bodySteerX: number;
  /** Manual vertical command (keyboard W/S): climb / accelerated fall */
  bodySteerY: number;
  gestureClass: GestureClass;
  confidence: number;
  source: "model" | "keyboard" | "heuristic";
}

export function neutralInput(): FlightInput {
  return {
    flapEnergy: 0,
    bodySteerX: 0,
    bodySteerY: 0,
    gestureClass: "neutral",
    confidence: 0,
    source: "heuristic",
  };
}

export interface RecordedSample {
  label: GestureClass;
  frames: number[][];
  timestamp: string;
}

export interface CourseStats {
  ringsCollected: number;
  ringsTotal: number;
  applesCollected: number;
  applesTotal: number;
  elapsedSeconds: number;
  score: number;
}
