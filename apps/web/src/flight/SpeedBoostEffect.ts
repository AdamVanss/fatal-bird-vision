import * as THREE from "three";
import type { FlightInput } from "../types";
import {
  SPEED_BOOST_COOLDOWN,
  SPEED_BOOST_DURATION,
  SPEED_BOOST_FOV_INCREASE,
  SPEED_BOOST_MULTIPLIER,
  SPEED_BOOST_RAMP_TIME,
  SPEED_BOOST_START_GRACE,
  VISUAL_FEATHER_FLAP_THRESHOLD,
} from "../constants";
import { EdgeTrigger } from "../utils/EdgeTrigger";

/**
 * Flaps are detected here off the shared FlightInput stream, so pose and
 * keyboard flaps both qualify. The flap edge uses the "follow" policy: holding
 * a flap (or Space) keeps the trigger consumed through the whole cooldown, so
 * the signal must relax below the threshold before a fresh boost can arm.
 */
export class SpeedBoostEffect {
  private state: "idle" | "boosting" | "cooldown" = "idle";
  private timer = 0;
  /** Pre-acknowledged at reset: the calibration exit swing can never dash */
  private readonly flapEdge = new EdgeTrigger("follow", true);
  private startGrace = SPEED_BOOST_START_GRACE;
  private speedMultiplier = 1;
  private fovOffset = 0;

  update(dt: number, input: FlightInput): void {
    this.timer += dt;

    if (this.state === "boosting" && this.timer >= SPEED_BOOST_DURATION) {
      this.state = "cooldown";
      this.timer = 0;
    } else if (
      this.state === "cooldown" &&
      this.timer >= SPEED_BOOST_COOLDOWN
    ) {
      this.state = "idle";
      this.timer = 0;
    }

    // A start-grace window after (re)spawning rejects triggers entirely, so
    // first-second jitter (incl. the shoulder-scale lock shifting pose
    // readings) never fires an instant dash.
    if (this.startGrace > 0) {
      this.startGrace = Math.max(0, this.startGrace - dt);
    }
    const flapping = input.flapEnergy > VISUAL_FEATHER_FLAP_THRESHOLD;
    if (
      this.flapEdge.update(flapping) &&
      this.state === "idle" &&
      this.startGrace === 0
    ) {
      this.state = "boosting";
      this.timer = 0;
    }

    if (this.state === "boosting") {
      const rampIn = THREE.MathUtils.clamp(
        this.timer / SPEED_BOOST_RAMP_TIME,
        0,
        1,
      );
      const rampOut = THREE.MathUtils.clamp(
        (SPEED_BOOST_DURATION - this.timer) / SPEED_BOOST_RAMP_TIME,
        0,
        1,
      );
      const envelope =
        THREE.MathUtils.smoothstep(rampIn, 0, 1) *
        THREE.MathUtils.smoothstep(rampOut, 0, 1);
      this.speedMultiplier = 1 + (SPEED_BOOST_MULTIPLIER - 1) * envelope;
      this.fovOffset = SPEED_BOOST_FOV_INCREASE * envelope;
    } else {
      this.speedMultiplier = 1;
      this.fovOffset = 0;
    }
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  getFovOffset(): number {
    return this.fovOffset;
  }

  reset(): void {
    this.state = "idle";
    this.timer = 0;
    this.flapEdge.reset(true);
    this.startGrace = SPEED_BOOST_START_GRACE;
    this.speedMultiplier = 1;
    this.fovOffset = 0;
  }
}
