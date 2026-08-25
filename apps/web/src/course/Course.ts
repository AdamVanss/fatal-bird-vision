import * as THREE from "three";
import {
  COLLISION,
  TUNNEL,
  VISUAL_APPLE_COLOR,
  VISUAL_APPLE_EMISSIVE,
  VISUAL_RING_COLOR,
  VISUAL_RING_EMISSIVE,
  VISUAL_RING_GLOW,
} from "../constants";
import { withinCylinder } from "../utils/math";
import type { TunnelWaypoint } from "./FlightTunnel";

export class RingGate {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  passed = false;
  readonly id: string;

  constructor(z: number, y: number, x = 0, id = `ring-${z}`) {
    this.id = id;
    this.position = new THREE.Vector3(x, y, z);
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.2, 12, 32),
      new THREE.MeshStandardMaterial({
        color: VISUAL_RING_COLOR,
        emissive: VISUAL_RING_EMISSIVE,
        emissiveIntensity: 0.5,
        roughness: 0.35,
        metalness: 0.6,
      }),
    );
    torus.castShadow = true;

    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(2.75, 0.06, 8, 32),
      new THREE.MeshBasicMaterial({
        color: VISUAL_RING_GLOW,
        transparent: true,
        opacity: 0.55,
      }),
    );

    this.mesh.add(torus, glow);
  }

  checkPass(birdPos: THREE.Vector3): boolean {
    if (this.passed) return false;
    const dx = birdPos.x - this.position.x;
    const dy = birdPos.y - this.position.y;
    const dz = birdPos.z - this.position.z;
    const inRing =
      withinCylinder(dx, dy, dz, COLLISION.ringRadius, COLLISION.ringDepth) &&
      birdPos.z > this.position.z - COLLISION.ringPlaneTolerance;
    if (inRing) {
      this.passed = true;
      return true;
    }
    return false;
  }
}

export class AppleCollectible {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  collected = false;
  readonly id: string;
  private bobPhase: number;

  constructor(z: number, y: number, x: number, id: string) {
    this.id = id;
    this.position = new THREE.Vector3(x, y, z);
    this.bobPhase = Math.random() * Math.PI * 2;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshStandardMaterial({
        color: VISUAL_APPLE_COLOR,
        roughness: 0.35,
        emissive: VISUAL_APPLE_EMISSIVE,
        emissiveIntensity: 0.2,
      }),
    );
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
  }

  update(dt: number): void {
    if (this.collected) {
      this.mesh.visible = false;
      return;
    }
    this.bobPhase += dt * 2;
    this.mesh.position.y = this.position.y + Math.sin(this.bobPhase) * 0.12;
    this.mesh.rotation.y += dt * 1.5;
  }

  tryCollect(birdPos: THREE.Vector3): boolean {
    if (this.collected) return false;
    // Measured against the logical position (not the bobbing mesh), matching
    // RingGate's anchor convention.
    if (birdPos.distanceTo(this.position) < COLLISION.appleRadius) {
      this.collected = true;
      return true;
    }
    return false;
  }
}

export interface CourseDefinition {
  rings: Array<{ z: number; y: number; x?: number }>;
  apples: Array<{ z: number; y: number; x: number }>;
}

export const DEFAULT_COURSE: CourseDefinition = {
  rings: [
    { z: 26, y: 7, x: 0 },
    { z: 52, y: 7.5, x: 1.5 },
    { z: 78, y: 6.5, x: -1.5 },
    { z: 104, y: 7, x: 0 },
    { z: 130, y: 7.5, x: 2 },
    { z: 156, y: 6.5, x: -2 },
    { z: 182, y: 7, x: 0 },
    { z: 208, y: 7, x: 1 },
  ],
  apples: [
    { z: 39, y: 7, x: 0.5 },
    { z: 65, y: 7, x: -0.5 },
    { z: 91, y: 7, x: 0 },
    { z: 117, y: 7, x: 1 },
    { z: 143, y: 7, x: -1 },
    { z: 169, y: 7, x: 0 },
    { z: 195, y: 7, x: 0.5 },
  ],
};

export function courseToTunnelWaypoints(
  def: CourseDefinition,
): TunnelWaypoint[] {
  const points: TunnelWaypoint[] = [{ x: 0, y: 7, z: 0 }];
  for (const ring of def.rings) {
    points.push({ x: ring.x ?? 0, y: ring.y, z: ring.z });
  }
  const last = def.rings[def.rings.length - 1];
  points.push({
    x: last?.x ?? 0,
    y: last?.y ?? 7,
    z: (last?.z ?? 0) + TUNNEL.ringSpacing,
  });
  return points;
}

export function lastGateZ(def: CourseDefinition): number {
  return def.rings[def.rings.length - 1]?.z ?? 0;
}

export class Course {
  readonly rings: RingGate[] = [];
  readonly apples: AppleCollectible[] = [];

  constructor(def: CourseDefinition = DEFAULT_COURSE) {
    def.rings.forEach((ringDef, i) => {
      this.rings.push(new RingGate(ringDef.z, ringDef.y, ringDef.x ?? 0, `ring-${i}`));
    });
    def.apples.forEach((appleDef, i) => {
      this.apples.push(new AppleCollectible(appleDef.z, appleDef.y, appleDef.x, `apple-${i}`));
    });
  }

  addToScene(scene: THREE.Scene): void {
    for (const ring of this.rings) scene.add(ring.mesh);
    for (const apple of this.apples) scene.add(apple.mesh);
  }

  reset(): void {
    for (const ring of this.rings) ring.passed = false;
    for (const apple of this.apples) {
      apple.collected = false;
      apple.mesh.visible = true;
    }
  }
}
