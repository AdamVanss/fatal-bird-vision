/**
 * Rising-edge detector over a thresholded boolean signal (the flap latch).
 *
 * Feed `update(signal)` each frame; it returns true while the signal is high
 * with its rise not yet consumed. Pair it with `acknowledge()` when you act on
 * the edge. Two consumption policies:
 * - **"relax"** — only `acknowledge()` consumes the rise, so a signal that
 *   rises during a busy window still fires as soon as the window lapses
 *   (FlightEffects: feathers/flap audio).
 * - **"follow"** — a high signal self-acknowledges immediately, so holding it
 *   can never arm a later fire when a gate reopens (SpeedBoostEffect: holding
 *   flap/Space must not dash across the cooldown boundary).
 */
export class EdgeTrigger {
  private readonly policy: "relax" | "follow";
  private acknowledged: boolean;

  constructor(policy: "relax" | "follow", startAcknowledged = false) {
    this.policy = policy;
    this.acknowledged = startAcknowledged;
  }

  update(signal: boolean): boolean {
    if (!signal) {
      this.acknowledged = false;
      return false;
    }
    if (this.policy === "follow") {
      this.acknowledged = true;
    }
    return !this.acknowledged;
  }

  acknowledge(): void {
    this.acknowledged = true;
  }

  reset(startAcknowledged = false): void {
    this.acknowledged = startAcknowledged;
  }
}
