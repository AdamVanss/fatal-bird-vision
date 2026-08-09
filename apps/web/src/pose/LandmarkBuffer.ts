import { WINDOW_SIZE, INPUT_DIM } from "../constants";
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

  getWindow(): Float32Array | null {
    if (this.frames.length < WINDOW_SIZE) return null;
    const out = new Float32Array(WINDOW_SIZE * INPUT_DIM);
    for (let t = 0; t < WINDOW_SIZE; t++) {
      out.set(this.frames[t], t * INPUT_DIM);
    }
    return out;
  }

  getAllFrames(): number[][] {
    return this.frames.map((f) => Array.from(f));
  }

  clear(): void {
    this.frames.length = 0;
  }
}
