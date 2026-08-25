import type * as THREE from "three";
import type { RingGate } from "../course/Course";
import type { FlightTunnel } from "../course/FlightTunnel";
import { COLLISION, COMBO_INCREMENT, COMBO_MAX_MULTIPLIER, COMBO_WALL_CONTACT_EPSILON } from "../constants";

/**
 * The multiplier is always derived from the integer hit count, so repeated
 * increments can never drift off a clean 0.5 step. Miss/wall detection also
 * lives here — nothing upstream reports either event: `update()` judges rings
 * the bird fully passed without threading and wall contact against the
 * tunnel's own playable bounds.
 */
export class ComboSystem {
  private consecutiveHits = 0;
  private readonly missedRings = new Set<string>();

  onRingHit(): void {
    this.consecutiveHits += 1;
  }

  private onRingMiss(): void {
    this.consecutiveHits = 0;
  }

  private onTunnelCollision(): void {
    this.consecutiveHits = 0;
  }

  getMultiplier(): number {
    return Math.min(
      1 + this.consecutiveHits * COMBO_INCREMENT,
      COMBO_MAX_MULTIPLIER,
    );
  }

  reset(): void {
    this.consecutiveHits = 0;
    this.missedRings.clear();
  }

  update(
    birdPos: THREE.Vector3,
    rings: RingGate[],
    tunnel: FlightTunnel,
  ): void {
    for (const ring of rings) {
      if (ring.passed || this.missedRings.has(ring.id)) continue;
      // Fully past the gate plane (beyond its collision depth) without
      // `passed` having been set → missed
      if (birdPos.z > ring.position.z + COLLISION.ringDepth) {
        this.missedRings.add(ring.id);
        this.onRingMiss();
        break;
      }
    }

    const center = tunnel.getCenterAt(birdPos.z);
    const touchingWall =
      Math.abs(birdPos.x - center.x) >=
        tunnel.playHalfWidth - COMBO_WALL_CONTACT_EPSILON ||
      Math.abs(birdPos.y - center.y) >=
        tunnel.playHalfHeight - COMBO_WALL_CONTACT_EPSILON;
    if (touchingWall) this.onTunnelCollision();
  }
}
