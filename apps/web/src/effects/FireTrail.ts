import * as THREE from "three";
import {
  COMBO_FIRE_COLOR_A,
  COMBO_FIRE_COLOR_B,
  COMBO_FIRE_EMIT_RATE,
  COMBO_FIRE_TRAIL_LIFETIME,
  COMBO_FIRE_TRAIL_MAX_PARTICLES,
  VISUAL_PARTICLE_POOLS,
} from "../constants";
import { makeCanvasTexture, PointPool } from "./PointPool";
import { ResourceTracker } from "../utils/ResourceTracker";

const TEXTURE_SIZE = 64;
const FLAME_CURL = 0.4;

function buildFlameTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(TEXTURE_SIZE, TEXTURE_SIZE, (ctx) => {
    const gradient = ctx.createRadialGradient(
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2,
      0,
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2,
      TEXTURE_SIZE / 2,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  });
}

/**
 * Fire trail behind the bird while the combo multiplier is ≥ 2×. Emission
 * scales with `setIntensity` (0 = off); when the combo resets, emission simply
 * stops and existing particles die out naturally.
 */
export class FireTrail extends PointPool {
  private readonly hotColor = new THREE.Color(COMBO_FIRE_COLOR_A);
  private readonly coolColor = new THREE.Color(COMBO_FIRE_COLOR_B);
  private readonly scratchColor = new THREE.Color();
  private readonly assets: ResourceTracker;
  private intensity = 0;
  private emitAccumulator = 0;

  constructor() {
    // Built before super() so the pooled material can take the map; `assets`
    // owns the texture for teardown.
    const assets = new ResourceTracker();
    super({
      max: COMBO_FIRE_TRAIL_MAX_PARTICLES,
      size: VISUAL_PARTICLE_POOLS.fireTrail.size,
      texture: assets.trackTexture(buildFlameTexture()),
    });
    this.assets = assets;
  }

  setIntensity(t: number): void {
    this.intensity = THREE.MathUtils.clamp(t, 0, 1);
  }

  emit(origin: THREE.Vector3, dt: number): void {
    if (this.intensity <= 0) return;
    this.emitAccumulator += COMBO_FIRE_EMIT_RATE * this.intensity * dt;
    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      this.spawn(origin);
    }
  }

  reset(): void {
    super.reset();
    this.intensity = 0;
    this.emitAccumulator = 0;
  }

  dispose(): void {
    super.dispose();
    this.assets.dispose();
  }

  protected stepParticle(index: number, o: number, dt: number): void {
    this.velocities[o + 1] += FLAME_CURL * dt; // flames curl upward as they age
    this.moveWithVelocity(o, dt);

    const ageFraction = 1 - this.life[index] / this.maxLife[index];
    // Hot → cool ramp, then sink toward black for the additive fade-out
    this.scratchColor.copy(this.hotColor).lerp(this.coolColor, ageFraction);
    this.scratchColor.multiplyScalar(1 - ageFraction);
    this.colors[o] = this.scratchColor.r;
    this.colors[o + 1] = this.scratchColor.g;
    this.colors[o + 2] = this.scratchColor.b;
  }

  private spawn(origin: THREE.Vector3): void {
    const i = this.nextSlot();
    const o = i * 3;
    this.positions[o] = origin.x + (Math.random() - 0.5) * 0.6;
    this.positions[o + 1] = origin.y + (Math.random() - 0.5) * 0.4;
    // Tail sits just behind the bird (-Z); bird motion does the rest
    this.positions[o + 2] = origin.z - 0.9 + (Math.random() - 0.5) * 0.4;
    this.velocities[o] = (Math.random() - 0.5) * 0.8;
    this.velocities[o + 1] = 0.5 + Math.random() * 0.9;
    this.velocities[o + 2] = -1.2 - Math.random() * 1.0;
    this.maxLife[i] = COMBO_FIRE_TRAIL_LIFETIME * (0.75 + Math.random() * 0.4);
    this.life[i] = this.maxLife[i];
  }
}
