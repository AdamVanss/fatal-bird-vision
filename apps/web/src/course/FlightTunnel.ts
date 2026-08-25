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
  readonly mesh: THREE.Group;

  constructor(waypoints: TunnelWaypoint[], finishZ: number) {
    this.waypoints = waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
    this.finishZ = finishZ;
    this.curve = new THREE.CatmullRomCurve3(
      this.waypoints,
      false,
      "catmullrom",
      TUNNEL.curveTension,
    );
    this.mesh = this.buildVisuals();
  }

  get playHalfWidth(): number {
    return TUNNEL.playHalfWidth;
  }

  get playHalfHeight(): number {
    return TUNNEL.playHalfHeight;
  }

  getCenterAt(z: number): THREE.Vector3 {
    const pts = this.waypoints;
    if (z <= pts[0].z) return pts[0].clone();
    const last = pts[pts.length - 1];
    if (z >= last.z) return last.clone();

    for (let i = 0; i < pts.length - 1; i++) {
      const before = pts[i];
      const after = pts[i + 1];
      if (z >= before.z && z <= after.z) {
        const fraction = (z - before.z) / (after.z - before.z);
        return new THREE.Vector3(
          THREE.MathUtils.lerp(before.x, after.x, fraction),
          THREE.MathUtils.lerp(before.y, after.y, fraction),
          z,
        );
      }
    }

    const total = last.z;
    return this.curve.getPointAt(THREE.MathUtils.clamp(z / total, 0, 1));
  }

  constrain(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const center = this.getCenterAt(position.z);
    const relX = position.x - center.x;
    const relY = position.y - center.y;

    const clampedX = THREE.MathUtils.clamp(relX, -this.playHalfWidth, this.playHalfWidth);
    const clampedY = THREE.MathUtils.clamp(relY, -this.playHalfHeight, this.playHalfHeight);

    if (clampedX !== relX) velocity.x = 0;
    if (clampedY !== relY) velocity.y = 0;

    position.x = center.x + clampedX;
    position.y = center.y + clampedY;
    position.z = THREE.MathUtils.clamp(position.z, 0, this.finishZ);
  }

  getGuidanceForce(position: THREE.Vector3): { x: number; y: number } {
    const center = this.getCenterAt(position.z);
    return {
      x: (center.x - position.x) * TUNNEL.guidanceStrengthX,
      y: (center.y - position.y) * TUNNEL.guidanceStrengthY,
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

    for (
      let z = 0;
      z <= this.waypoints[this.waypoints.length - 1].z;
      z += TUNNEL.frameSpacing
    ) {
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
