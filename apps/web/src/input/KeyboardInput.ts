import type { FlightInput } from "../types";

export class KeyboardInput {
  private keys = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "KeyR"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  poll(): FlightInput {
    let flapEnergy = 0;
    let bank = 0;
    let pitchIntent = 0;

    if (this.keys.has("Space")) flapEnergy = 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) bank = -1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) bank = 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) pitchIntent = 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) pitchIntent = -1;

    let gestureClass: FlightInput["gestureClass"] = "neutral";
    if (flapEnergy > 0) gestureClass = "flap";
    else if (pitchIntent < 0) gestureClass = "dive";
    else if (bank !== 0) gestureClass = bank < 0 ? "bank_left" : "bank_right";

    return {
      flapEnergy,
      bank,
      pitchIntent,
      bodySteerX: bank,
      bodySteerY: pitchIntent,
      gestureClass,
      confidence: 1,
      source: "keyboard",
    };
  }

  wantsRestart(): boolean {
    return this.keys.has("KeyR");
  }
}
