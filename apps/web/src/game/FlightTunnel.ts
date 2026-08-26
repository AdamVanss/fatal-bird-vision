import * as THREE from "three";
import { CANYON } from "../constants";

export interface TunnelWaypoint {
  x: number;
  y: number;
  z: number;
}

/** Invisible flight path through the canyon. No tube mesh. */
export class FlightTunnel {
  readonly waypoints: THREE.Vector3[];
  readonly finishZ: number;
  readonly meshGroup = new THREE.Group();

  constructor(waypoints: TunnelWaypoint[]) {
    this.waypoints = waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
    this.finishZ = this.waypoints[this.waypoints.length - 1].z;
  }

  getCenterAt(z: number): THREE.Vector3 {
    const pts = this.waypoints;
    if (z <= pts[0].z) return pts[0].clone();
    const last = pts[pts.length - 1];
    if (z >= last.z) return last.clone();

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (z >= a.z && z <= b.z) {
        const f = (z - a.z) / (b.z - a.z);
        return new THREE.Vector3(
          THREE.MathUtils.lerp(a.x, b.x, f),
          THREE.MathUtils.lerp(a.y, b.y, f),
          z,
        );
      }
    }

    return last.clone();
  }

  /** Soft clamp inside the canyon play volume */
  constrain(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const center = this.getCenterAt(position.z);
    const hw = CANYON.playHalfWidth;
    const hh = CANYON.playHalfHeight;

    const relX = position.x - center.x;
    const relY = position.y - center.y;

    const clampedX = THREE.MathUtils.clamp(relX, -hw, hw);
    const clampedY = THREE.MathUtils.clamp(relY, -hh, hh);

    if (clampedX !== relX) velocity.x *= 0.2;
    if (clampedY !== relY) velocity.y *= 0.2;

    position.x = center.x + clampedX;
    position.y = center.y + clampedY;
    position.z = Math.max(0, position.z);
  }
}
