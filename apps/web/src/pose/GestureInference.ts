import type { GestureClass } from "../constants";
import { LANDMARK_SLOTS, POSE_PUMP, POSE_ZONE } from "../constants";
import type { FlightInput } from "../types";
import { clamp } from "../utils/math";

type ArmZone = "up" | "level" | "down";

/**
 * Shoulder-relative y offset of a joint, in normalized units (y grows
 * downward, so negative = above the shoulder line).
 */
function jointOffset(
  frame: Float32Array,
  joint: number,
  shoulder: number,
): number {
  return frame[joint * 3 + 1] - frame[shoulder * 3 + 1];
}

function nextArmZone(
  zone: ArmZone,
  wristOffset: number,
  elbowOffset: number,
): ArmZone {
  const { margin, levelReturn } = POSE_ZONE;
  const bothAbove = wristOffset < -margin && elbowOffset < -margin;
  const bothBelow = wristOffset > margin && elbowOffset > margin;

  if (zone === "up") {
    if (bothBelow) return "down";
    return wristOffset < -levelReturn || elbowOffset < -levelReturn
      ? "up"
      : "level";
  }
  if (zone === "down") {
    if (bothAbove) return "up";
    return wristOffset > levelReturn || elbowOffset > levelReturn
      ? "down"
      : "level";
  }
  return bothAbove ? "up" : bothBelow ? "down" : "level";
}

/**
 * Pose-grammar flight controls: named arm poses map straight to flight states.
 *
 * Glide = nothing below the shoulder line (T-pose, both arms up, mixed up/level).
 * Bank = one arm up while the other is down, sliding toward the raised hand's
 * screen side at a speed proportional to the raise depth. Neutral = anything
 * held down without the opposite arm up — steady sink. Flap = discrete upward
 * pumps of both hands; holding hands high never produces lift.
 */
export class GestureInference {
  private leftZone: ArmZone = "level";
  private rightZone: ArmZone = "level";
  private burstEnergy = 0;
  private burstUntil = 0;
  private lastPumpAt = -Infinity;

  reset(): void {
    this.leftZone = "level";
    this.rightZone = "level";
    this.burstEnergy = 0;
    this.burstUntil = 0;
    this.lastPumpAt = -Infinity;
  }

  heuristicFromFrames(
    current: Float32Array,
    previous: Float32Array | null,
  ): FlightInput {
    const lWristOffset = jointOffset(
      current,
      LANDMARK_SLOTS.leftWrist,
      LANDMARK_SLOTS.leftShoulder,
    );
    const rWristOffset = jointOffset(
      current,
      LANDMARK_SLOTS.rightWrist,
      LANDMARK_SLOTS.rightShoulder,
    );
    this.updateArmZones(lWristOffset, rWristOffset, current);

    const { gestureClass, bodySteerX } = this.classifyBank(
      lWristOffset,
      rWristOffset,
    );
    const flapEnergy = this.updatePump(current, previous);

    return {
      flapEnergy,
      bodySteerX,
      bodySteerY: 0,
      gestureClass: flapEnergy > 0 ? "flap" : gestureClass,
      confidence: 0.75,
      source: "heuristic",
    };
  }

  private updateArmZones(
    lWristOffset: number,
    rWristOffset: number,
    current: Float32Array,
  ): void {
    this.leftZone = nextArmZone(
      this.leftZone,
      lWristOffset,
      jointOffset(current, LANDMARK_SLOTS.leftElbow, LANDMARK_SLOTS.leftShoulder),
    );
    this.rightZone = nextArmZone(
      this.rightZone,
      rWristOffset,
      jointOffset(current, LANDMARK_SLOTS.rightElbow, LANDMARK_SLOTS.rightShoulder),
    );
  }

  /**
   * Slide direction: the chase camera renders world −X on screen-right, and
   * a raised LEFT wrist sits at positive normalized x — so left-up banks
   * with negative bodySteerX (screen-right). Verified empirically at playtest.
   */
  private classifyBank(
    lWristOffset: number,
    rWristOffset: number,
  ): { gestureClass: GestureClass; bodySteerX: number } {
    if (this.leftZone === "up" && this.rightZone === "down") {
      return {
        gestureClass: "bank_right",
        bodySteerX: -clamp(-lWristOffset / POSE_ZONE.bankFullDeflect, 0, 1),
      };
    }
    if (this.leftZone === "down" && this.rightZone === "up") {
      return {
        gestureClass: "bank_left",
        bodySteerX: clamp(-rWristOffset / POSE_ZONE.bankFullDeflect, 0, 1),
      };
    }
    if (this.leftZone === "down" || this.rightZone === "down") {
      // Conservative rule: an arm down without the opposite arm up ⇒ sink.
      return { gestureClass: "neutral", bodySteerX: 0 };
    }
    return { gestureClass: "glide", bodySteerX: 0 };
  }

  /**
   * One lift burst per upward pump of both hands; holding high does nothing.
   * Rise is measured on shoulder-relative offsets, not raw y, so torso bob or
   * posture shifts between frames can neither fake nor flip the direction:
   * hands rising shrink their offset (positive term), a drop grows both terms
   * negative — a downward sweep can never fire.
   */
  private updatePump(
    current: Float32Array,
    previous: Float32Array | null,
  ): number {
    const now = performance.now();
    if (previous) {
      const rise = Math.min(
        jointOffset(previous, LANDMARK_SLOTS.leftWrist, LANDMARK_SLOTS.leftShoulder) -
          jointOffset(current, LANDMARK_SLOTS.leftWrist, LANDMARK_SLOTS.leftShoulder),
        jointOffset(previous, LANDMARK_SLOTS.rightWrist, LANDMARK_SLOTS.rightShoulder) -
          jointOffset(current, LANDMARK_SLOTS.rightWrist, LANDMARK_SLOTS.rightShoulder),
      );
      if (
        rise > POSE_PUMP.minRise &&
        now - this.lastPumpAt >= POSE_PUMP.refractoryMs
      ) {
        this.lastPumpAt = now;
        this.burstUntil = now + POSE_PUMP.holdMs;
        // Floor at 0.85 so every registered pump crosses the shared hard-flap
        // threshold (VISUAL_FEATHER_FLAP_THRESHOLD = 0.8).
        this.burstEnergy = clamp(rise * POSE_PUMP.gain, 0.85, 1);
      }
    }
    return now < this.burstUntil ? this.burstEnergy : 0;
  }
}
