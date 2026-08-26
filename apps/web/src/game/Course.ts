import * as THREE from "three";
import { CANYON } from "../constants";
import { canyonHeight } from "./World";
import type { TunnelWaypoint } from "./FlightTunnel";

export type RingTier = "bronze" | "silver" | "gold";
export type RingPassResult = "hit" | "miss" | null;

interface TierLook {
  radius: number;
  tube: number;
  color: number;
  emissive: number;
}

const PASSED_COLOR = 0x22c55e;
const PASSED_EMISSIVE = 0x6dff9c;

const TIER: Record<RingTier, TierLook> = {
  bronze: {
    radius: 3.55,
    tube: 0.22,
    color: 0xff6a2b,
    emissive: 0xff9a4a,
  },
  silver: {
    radius: 2.95,
    tube: 0.18,
    color: 0x2eb8ff,
    emissive: 0x7ad4ff,
  },
  gold: {
    radius: 2.4,
    tube: 0.16,
    color: 0xffd12a,
    emissive: 0xffe98a,
  },
};

const SPEED_LOOK: TierLook = {
  radius: 2.7,
  tube: 0.2,
  color: 0x22d3ee,
  emissive: 0x67e8f9,
};

export class RingGate {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  readonly tier: RingTier;
  readonly radius: number;
  readonly speedGate: boolean;
  passed = false;
  missed = false;
  readonly id: string;
  readonly homeX: number;
  readonly homeY: number;
  readonly phase: number;
  readonly ampX: number;
  readonly ampY: number;
  private readonly torusMat: THREE.MeshStandardMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private pulse = 0;

  constructor(
    z: number,
    y: number,
    x: number,
    tier: RingTier,
    id: string,
    index: number,
    speedGate = false,
  ) {
    this.id = id;
    this.tier = tier;
    this.speedGate = speedGate;
    const look = speedGate ? SPEED_LOOK : TIER[tier];
    this.radius = look.radius;
    this.homeX = x;
    this.homeY = y;
    this.phase = index * 0.73;
    this.ampX = 1.8 + (index % 3) * 0.45;
    this.ampY = 1.1 + (index % 2) * 0.35;
    this.position = new THREE.Vector3(x, y, z);
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    this.torusMat = new THREE.MeshStandardMaterial({
      color: look.color,
      emissive: look.emissive,
      emissiveIntensity: 0.7,
      roughness: 0.22,
      metalness: 0.78,
    });
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(look.radius, look.tube, 16, 48),
      this.torusMat,
    );
    torus.castShadow = true;

    this.glowMat = new THREE.MeshBasicMaterial({
      color: look.emissive,
      transparent: true,
      opacity: 0.5,
    });
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(look.radius + 0.18, 0.07, 8, 36),
      this.glowMat,
    );

    this.mesh.add(torus, glow);
    if (speedGate) {
      const core = new THREE.Mesh(
        new THREE.TorusGeometry(look.radius * 0.55, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({
          color: 0xecfeff,
          transparent: true,
          opacity: 0.7,
        }),
      );
      this.mesh.add(core);
    }
  }

  restoreLook(): void {
    const look = this.speedGate ? SPEED_LOOK : TIER[this.tier];
    this.torusMat.color.setHex(look.color);
    this.torusMat.emissive.setHex(look.emissive);
    this.torusMat.emissiveIntensity = 0.7;
    this.glowMat.color.setHex(look.emissive);
    this.glowMat.opacity = 0.55;
    this.mesh.scale.setScalar(1);
  }

  update(dt: number, isNext: boolean, moving: boolean, clock: number, moveAmp = 1): void {
    this.pulse += dt * 3.2;
    if (moving && !this.passed && !this.missed) {
      const maxX = CANYON.playHalfWidth - 1.2;
      const maxYOff = CANYON.playHalfHeight - 0.8;
      this.position.x = THREE.MathUtils.clamp(
        this.homeX + Math.sin(clock * 1.45 + this.phase) * this.ampX * moveAmp,
        -maxX,
        maxX,
      );
      this.position.y = THREE.MathUtils.clamp(
        this.homeY + Math.cos(clock * 1.05 + this.phase * 1.35) * this.ampY * moveAmp,
        CANYON.flightHeight - maxYOff,
        CANYON.flightHeight + maxYOff,
      );
      this.mesh.position.copy(this.position);
    }
    if (this.passed) {
      this.torusMat.color.setHex(PASSED_COLOR);
      this.torusMat.emissive.setHex(PASSED_EMISSIVE);
      this.torusMat.emissiveIntensity = 1.15;
      this.glowMat.color.setHex(PASSED_EMISSIVE);
      this.glowMat.opacity = 0.9;
      this.mesh.scale.setScalar(THREE.MathUtils.lerp(this.mesh.scale.x, 1.08, 0.12));
      return;
    }
    if (this.missed) {
      this.torusMat.emissiveIntensity = 0.12;
      this.glowMat.opacity = 0.18;
      return;
    }
    if (isNext) {
      const wave = 0.55 + Math.sin(this.pulse) * 0.4;
      this.torusMat.emissiveIntensity = wave;
      this.glowMat.opacity = 0.4 + Math.sin(this.pulse) * 0.25;
      const s = 1 + Math.sin(this.pulse) * 0.04;
      this.mesh.scale.setScalar(s);
    } else {
      this.torusMat.emissiveIntensity = 0.28;
      this.glowMat.opacity = 0.28;
      this.mesh.scale.setScalar(1);
    }
  }

  checkPass(birdPos: THREE.Vector3): RingPassResult {
    if (this.passed || this.missed) return null;
    const dx = birdPos.x - this.position.x;
    const dy = birdPos.y - this.position.y;
    const dz = birdPos.z - this.position.z;
    const inRing =
      Math.abs(dz) < 2.2 &&
      Math.sqrt(dx * dx + dy * dy) < this.radius - 0.15 &&
      birdPos.z > this.position.z - 0.4;
    if (inRing) {
      this.passed = true;
      return "hit";
    }
    if (birdPos.z > this.position.z + 2.4) {
      this.missed = true;
      return "miss";
    }
    return null;
  }
}

export interface CourseRingDef {
  z: number;
  y: number;
  x?: number;
  tier: RingTier;
  speed?: boolean;
}

export interface CourseDefinition {
  rings: CourseRingDef[];
}

const H = CANYON.flightHeight;

/** First hoop is easy; later hoops sit well off the canyon centerline */
export const DEFAULT_COURSE: CourseDefinition = {
  rings: [
    { z: 28, y: H, x: 0, tier: "bronze" },
    { z: 56, y: H + 2.8, x: -5.4, tier: "bronze" },
    { z: 84, y: H - 3.6, x: 6.2, tier: "bronze" },
    { z: 98, y: H + 3.2, x: 5.2, tier: "bronze", speed: true },
    { z: 112, y: H + 4.4, x: 5.8, tier: "bronze" },
    { z: 140, y: H - 4.2, x: -6.4, tier: "silver" },
    { z: 168, y: H + 1.2, x: 6.6, tier: "silver" },
    { z: 196, y: H - 4.8, x: -4.2, tier: "silver" },
    { z: 210, y: H - 3.4, x: -5.8, tier: "bronze", speed: true },
    { z: 224, y: H + 4.8, x: 3.6, tier: "gold" },
    { z: 252, y: H - 2.2, x: -6.8, tier: "gold" },
    { z: 280, y: H + 3.4, x: 6.4, tier: "gold" },
    { z: 308, y: H - 3.8, x: -5.8, tier: "silver" },
    { z: 336, y: H + 4.6, x: 6.5, tier: "silver" },
    { z: 350, y: H + 4.0, x: 6.0, tier: "bronze", speed: true },
    { z: 364, y: H - 1.6, x: -6.7, tier: "silver" },
    { z: 392, y: H + 3.0, x: 4.8, tier: "gold" },
    { z: 420, y: H - 4.6, x: 6.1, tier: "gold" },
    { z: 448, y: H + 2.2, x: -5.5, tier: "gold" },
    { z: 462, y: H - 2.8, x: -4.9, tier: "bronze", speed: true },
    { z: 476, y: H - 3.2, x: 6.7, tier: "gold" },
    { z: 504, y: H + 4.4, x: -6.3, tier: "gold" },
    { z: 532, y: H - 4.0, x: 5.6, tier: "gold" },
    { z: 560, y: H + 1.8, x: -6.6, tier: "gold" },
  ],
};

export function courseToTunnelWaypoints(
  def: CourseDefinition,
): TunnelWaypoint[] {
  const last = def.rings[def.rings.length - 1];
  return [
    { x: 0, y: H, z: 0 },
    { x: 0, y: H, z: last.z + 22 },
  ];
}

function makeCheckerTexture(): THREE.CanvasTexture {
  const size = 256;
  const cellsX = 8;
  const cellsY = 3;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cw = size / cellsX;
  const ch = size / cellsY;
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#1a1a1a" : "#ececec";
      ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FinishBanner {
  readonly mesh = new THREE.Group();
  readonly z: number;

  constructor(z: number) {
    this.z = z;
    this.mesh.position.set(0, 0, z);
    this.replant(canyonHeight);
  }

  replant(heightAt: (x: number, z: number) => number): void {
    while (this.mesh.children.length) {
      this.mesh.remove(this.mesh.children[0]);
    }

    const leftX = -9.6;
    const rightX = 9.6;
    const yL = heightAt(leftX, this.z);
    const yR = heightAt(rightX, this.z);
    const top = Math.max(yL, yR, H) + 7.4;
    const span = rightX - leftX;
    const midY = (yL + yR) * 0.5 + (top - Math.max(yL, yR)) * 0.55;

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(span - 0.4, 4.4, 0.18),
      new THREE.MeshStandardMaterial({
        map: makeCheckerTexture(),
        roughness: 0.55,
        metalness: 0.04,
        emissive: 0x2a2a2a,
        emissiveIntensity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    banner.position.set(0, midY + 1.6, 0);
    banner.castShadow = true;
    this.mesh.add(banner);

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x5a5048,
      emissive: 0x3a342c,
      emissiveIntensity: 0.55,
      roughness: 0.62,
      metalness: 0.22,
    });
    const makePole = (x: number, groundY: number) => {
      const h = top - groundY + 0.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, h, 8), poleMat);
      pole.position.set(x, groundY + h * 0.5, 0);
      pole.castShadow = true;
      return pole;
    };
    this.mesh.add(makePole(leftX, yL), makePole(rightX, yR));
  }
}

export class Course {
  readonly rings: RingGate[] = [];
  readonly finish: FinishBanner;
  readonly finishZ: number;
  movingRings = false;
  private moveClock = 0;

  constructor(def: CourseDefinition = DEFAULT_COURSE) {
    def.rings.forEach((r, i) => {
      this.rings.push(
        new RingGate(r.z, r.y, r.x ?? 0, r.tier, `ring-${i}`, i, r.speed === true),
      );
    });
    const hoops = this.rings.filter((r) => !r.speedGate);
    const lastHoop = hoops[hoops.length - 1];
    this.finishZ = (lastHoop?.position.z ?? 280) + 22;
    this.finish = new FinishBanner(this.finishZ);
  }

  get hoopCount(): number {
    return this.rings.filter((r) => !r.speedGate).length;
  }

  addToScene(scene: THREE.Scene): void {
    for (const ring of this.rings) scene.add(ring.mesh);
    scene.add(this.finish.mesh);
  }

  nextUnpassedIndex(): number {
    return this.rings.findIndex((r) => !r.passed && !r.missed);
  }

  update(dt: number, moveRate = 1): void {
    if (this.movingRings) this.moveClock += dt * moveRate;
    const next = this.nextUnpassedIndex();
    const moveAmp = Math.min(1, Math.max(0.35, moveRate || 1));
    this.rings.forEach((ring, i) =>
      ring.update(dt, i === next, this.movingRings, this.moveClock, moveAmp),
    );
  }

  reset(movingRings = false): void {
    this.movingRings = movingRings;
    this.moveClock = 0;
    for (const ring of this.rings) {
      ring.passed = false;
      ring.missed = false;
      ring.position.x = ring.homeX;
      ring.position.y = ring.homeY;
      ring.mesh.position.copy(ring.position);
      ring.mesh.scale.setScalar(1);
      ring.restoreLook();
    }
  }
}
