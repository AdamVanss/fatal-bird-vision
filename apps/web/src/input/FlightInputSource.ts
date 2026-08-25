import type { FlightInput } from "../types";
import { neutralInput } from "../types";
import { KeyboardInput } from "./KeyboardInput";
import { PoseDetector } from "../pose/PoseDetector";
import { GestureInference } from "../pose/GestureInference";

export class FlightInputSource {
  private readonly keyboard = new KeyboardInput();
  private readonly gesture = new GestureInference();
  private readonly pose: PoseDetector;

  constructor(pose: PoseDetector) {
    this.pose = pose;
  }

  get poseTracking(): boolean {
    return this.pose.tracking;
  }

  wantsRestart(): boolean {
    return this.keyboard.wantsRestart();
  }

  dispose(): void {
    this.keyboard.dispose();
  }

  poll(): FlightInput {
    const kb = this.keyboard.poll();
    if (kb.flapEnergy > 0 || kb.bodySteerX !== 0 || kb.bodySteerY !== 0) {
      return kb;
    }

    if (!this.pose.tracking) {
      this.gesture.reset();
      return neutralInput();
    }

    const current = this.pose.buffer.getLatest();
    if (!current) {
      this.gesture.reset();
      return neutralInput();
    }

    return this.gesture.heuristicFromFrames(
      current,
      this.pose.buffer.getPrevious(),
    );
  }
}
