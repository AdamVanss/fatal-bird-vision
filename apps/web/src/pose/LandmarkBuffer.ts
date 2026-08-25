import { WINDOW_SIZE } from "../constants";
import type { NormalizedFrame } from "../types";

export class LandmarkBuffer {
  private readonly frames: Float32Array[] = [];

  push(frame: NormalizedFrame): void {
    this.frames.push(frame.landmarks.slice());
    while (this.frames.length > WINDOW_SIZE) {
      this.frames.shift();
    }
  }

  get length(): number {
    return this.frames.length;
  }

  getLatest(): Float32Array | null {
    if (!this.frames.length) return null;
    return this.frames[this.frames.length - 1];
  }

  getPrevious(): Float32Array | null {
    if (this.frames.length < 2) return null;
    return this.frames[this.frames.length - 2];
  }
}
