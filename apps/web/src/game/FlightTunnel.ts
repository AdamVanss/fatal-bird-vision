import * as THREE from "three";
import { TUNNEL } from "../constants";

export interface TunnelWaypoint {
  x: number;
  y: number;
  z: number;
}

export class FlightTunnel {
  readonly waypoints: THREE.Vector3[];
  readonly finishZ: number;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly mesh: THREE.Group;

  constructor(waypoints: TunnelWaypoint[]) {
    this.waypoints = waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
    this.finishZ = this.waypoints[this.waypoints.length - 1].z + 20;
    this.curve = new THREE.CatmullRomCurve3(this.waypoints, false, "catmullrom", 0.35);
    this.mesh = this.buildVisuals();
  }

  get meshGroup(): THREE.Group {
    return this.mesh;
  }

  /** Tunnel center on the course line at the bird's current Z */
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

    const total = last.z;
    return this.curve.getPointAt(THREE.MathUtils.clamp(z / total, 0, 1));
  }

  /** Hard clamp — bird cannot leave the tunnel volume */
  constrain(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const center = this.getCenterAt(position.z);
    const hw = TUNNEL.playHalfWidth;
    const hh = TUNNEL.playHalfHeight;

    const relX = position.x - center.x;
    const relY = position.y - center.y;

    const clampedX = THREE.MathUtils.clamp(relX, -hw, hw);
    const clampedY = THREE.MathUtils.clamp(relY, -hh, hh);

    if (clampedX !== relX) velocity.x = 0;
    if (clampedY !== relY) velocity.y = 0;

    position.x = center.x + clampedX;
    position.y = center.y + clampedY;
    position.z = THREE.MathUtils.clamp(position.z, 0, this.finishZ);
  }

  getGuidanceForce(position: THREE.Vector3): { x: number; y: number } {
    const center = this.getCenterAt(position.z);
    return {
      x: (center.x - position.x) * 0.2,
      y: (center.y - position.y) * 0.25,
    };
  }

  private buildVisuals(): THREE.Group {
    const group = new THREE.Group();
    const visualRadius = TUNNEL.halfWidth;

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, 160, visualRadius * 0.95, 14, false),
      new THREE.MeshStandardMaterial({
        color: 0x7ec8e3,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
        roughness: 0.2,
        metalness: 0.1,
        depthWrite: false,
      }),
    );
    group.add(tube);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a42,
      emissive: 0x3ecf8e,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.55,
      metalness: 0.4,
    });

    for (let z = 0; z <= this.waypoints[this.waypoints.length - 1].z; z += 13) {
      const center = this.getCenterAt(z);
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(visualRadius * 0.92, 0.06, 6, 24),
        ringMat,
      );
      frame.position.copy(center);
      frame.rotation.x = Math.PI / 2;
      group.add(frame);
    }

    return group;
  }
}
