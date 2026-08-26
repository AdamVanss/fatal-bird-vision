import type { FlightInput } from "../types";
import { KEYBOARD_STEER_RATE } from "../constants";

export class KeyboardInput {
  private keys = new Set<string>();
  private offsetX = 0;
  private offsetY = 0;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (isTypingTarget(e.target)) return;
      this.keys.add(e.code);
      if (
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyR",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (isTypingTarget(e.target)) return;
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  isSteering(): boolean {
    return (
      this.keys.has("KeyA") ||
      this.keys.has("KeyD") ||
      this.keys.has("KeyW") ||
      this.keys.has("KeyS") ||
      this.keys.has("ArrowLeft") ||
      this.keys.has("ArrowRight") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown")
    );
  }

  poll(dt = 0): FlightInput {
    if (dt > 0) {
      let dx = 0;
      let dy = 0;
      // A/D inverted vs world +X so they match on-screen left/right
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx += 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx -= 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy -= 1;

      this.offsetX = clamp(this.offsetX + dx * KEYBOARD_STEER_RATE * dt, -1, 1);
      this.offsetY = clamp(this.offsetY + dy * KEYBOARD_STEER_RATE * dt, -1, 1);
    }

    let flapEnergy = 0;
    if (this.keys.has("Space")) flapEnergy = 1;

    let gestureClass: FlightInput["gestureClass"] = "neutral";
    if (flapEnergy > 0) gestureClass = "flap";
    else if (this.offsetY < -0.15) gestureClass = "dive";
    else if (this.offsetX < -0.15) gestureClass = "bank_right";
    else if (this.offsetX > 0.15) gestureClass = "bank_left";

    return {
      flapEnergy,
      bank: this.offsetX,
      pitchIntent: this.offsetY,
      bodySteerX: this.offsetX,
      bodySteerY: this.offsetY,
      gestureClass,
      confidence: 1,
      source: "keyboard",
    };
  }

  setOffset(x: number, y: number): void {
    this.offsetX = clamp(x, -1, 1);
    this.offsetY = clamp(y, -1, 1);
  }

  reset(): void {
    this.offsetX = 0;
    this.offsetY = 0;
  }

  wantsRestart(): boolean {
    return this.keys.has("KeyR");
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
