import { clamp } from "../utils/math";
import type { FlightInput } from "../types";

/**
 * Keyboard parity for the arm-pose grammar. Signs follow the on-screen chase
 * camera: the camera looks toward world +Z, so world −X renders screen-right —
 * A moves screen-left (+X), D moves screen-right (−X).
 */
export class KeyboardInput {
  private keys = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "KeyR"].includes(e.code)) {
      e.preventDefault();
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keys.clear();
  }

  poll(): FlightInput {
    let flapEnergy = 0;
    let bodySteerX = 0;
    let bodySteerY = 0;

    if (this.keys.has("Space")) flapEnergy = 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) bodySteerX += 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) bodySteerX -= 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) bodySteerY = 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) bodySteerY = -1;
    bodySteerX = clamp(bodySteerX, -1, 1);

    // Grammar class mirrors the slide direction (bank_* is named for where
    // the bird slides, matching the pose path's sign convention).
    let gestureClass: FlightInput["gestureClass"] = "neutral";
    if (flapEnergy > 0) gestureClass = "flap";
    else if (bodySteerX < 0) gestureClass = "bank_right";
    else if (bodySteerX > 0) gestureClass = "bank_left";

    return {
      flapEnergy,
      bodySteerX,
      bodySteerY,
      gestureClass,
      confidence: 1,
      source: "keyboard",
    };
  }

  wantsRestart(): boolean {
    return this.keys.has("KeyR");
  }
}
