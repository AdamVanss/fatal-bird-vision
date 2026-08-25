import * as THREE from "three";
import {
  VISUAL_BURST_LIFETIME,
  VISUAL_FEATHER_LIFETIME,
  VISUAL_PARTICLE_COLORS,
  VISUAL_PARTICLE_MAX_COUNT,
  VISUAL_PARTICLE_POOLS,
  VISUAL_WIND_LIFETIME,
} from "../constants";
import { makeCanvasTexture, PointPool } from "./PointPool";
import { ResourceTracker } from "../utils/ResourceTracker";

export type ParticleType =
  | "wind"
  | "ring"
  | "apple"
  | "feather"
  | "finish"
  | "timeout";

export interface SpawnParams {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  color: { r: number; g: number; b: number };
  lifetime: number;
}

export type BurstType = "ring" | "apple" | "finish" | "timeout";

export interface BurstEmission {
  color: THREE.Color;
  minSpeed: number;
  maxSpeed: number;
  forwardBias: number;
  lifetime: number;
}

interface PoolOptions {
  gravity: number;
  /** exponential velocity damping per second */
  drag: number;
  /** horizontal flutter amplitude (feathers) */
  sway: number;
}

/**
 * Spark/streak/feather pool: the shared point-pool ring buffer plus per-pool
 * physics (gravity, drag, optional sinusoidal sway); color fades from each
 * particle's base color toward black over its lifetime.
 */
class ParticlePool extends PointPool {
  private readonly baseColors: Float32Array;
  private readonly swayPhase: Float32Array;
  private readonly physics: PoolOptions;
  private elapsed = 0;

  constructor(
    options: { max: number; size: number; texture: THREE.Texture } & PoolOptions,
  ) {
    super(options);
    this.physics = {
      gravity: options.gravity,
      drag: options.drag,
      sway: options.sway,
    };
    this.baseColors = new Float32Array(options.max * 3);
    this.swayPhase = new Float32Array(options.max);
  }

  spawn(params: SpawnParams): void {
    const { position: p, velocity: v, color: c, lifetime } = params;
    const i = this.nextSlot();
    const o = i * 3;
    this.positions[o] = p.x;
    this.positions[o + 1] = p.y;
    this.positions[o + 2] = p.z;
    this.velocities[o] = v.x;
    this.velocities[o + 1] = v.y;
    this.velocities[o + 2] = v.z;
    this.baseColors[o] = c.r;
    this.baseColors[o + 1] = c.g;
    this.baseColors[o + 2] = c.b;
    this.colors[o] = c.r;
    this.colors[o + 1] = c.g;
    this.colors[o + 2] = c.b;
    this.life[i] = lifetime;
    this.maxLife[i] = lifetime;
    this.swayPhase[i] = Math.random() * Math.PI * 2;
  }

  update(dt: number): void {
    this.elapsed += dt;
    super.update(dt);
  }

  protected stepParticle(index: number, o: number, dt: number): void {
    const { gravity, drag, sway } = this.physics;
    const damp = Math.max(0, 1 - drag * dt);

    this.velocities[o + 1] += gravity * dt;
    this.velocities[o] *= damp;
    this.velocities[o + 1] *= damp;
    this.velocities[o + 2] *= damp;
    this.moveWithVelocity(o, dt);
    if (sway > 0) {
      this.positions[o] +=
        Math.sin(this.elapsed * 6 + this.swayPhase[index]) * sway * dt;
    }

    const fade = this.life[index] / this.maxLife[index];
    this.colors[o] = this.baseColors[o] * fade;
    this.colors[o + 1] = this.baseColors[o + 1] * fade;
    this.colors[o + 2] = this.baseColors[o + 2] * fade;
  }
}

function makeSparkTexture(): THREE.Texture {
  return makeCanvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.55)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function makeStreakTexture(): THREE.Texture {
  return makeCanvasTexture(16, 64, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(0.65, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(6, 0, 4, 64);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(4, 0, 8, 64);
  });
}

function makeFeatherTexture(): THREE.Texture {
  return makeCanvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 30, 2, 32, 30, 28);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.5)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(32, 3);
    ctx.quadraticCurveTo(57, 30, 32, 61);
    ctx.quadraticCurveTo(7, 30, 32, 3);
    ctx.fill();
  });
}

function randomDirection(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(t), r * Math.sin(t), u);
}

/** Wind streaks, bursts and feather flutters — CPU-simulated across three pooled THREE.Points draw calls. */
export class ParticleSystem {
  readonly group = new THREE.Group();

  private readonly windPool: ParticlePool;
  private readonly burstPool: ParticlePool;
  private readonly featherPool: ParticlePool;
  private readonly resources = new ResourceTracker();
  private readonly windColor = new THREE.Color(VISUAL_PARTICLE_COLORS.wind);
  private readonly ringColor = new THREE.Color(VISUAL_PARTICLE_COLORS.ring);
  private readonly appleColor = new THREE.Color(VISUAL_PARTICLE_COLORS.apple);
  private readonly featherA = new THREE.Color(
    VISUAL_PARTICLE_COLORS.featherA,
  );
  private readonly featherB = new THREE.Color(
    VISUAL_PARTICLE_COLORS.featherB,
  );
  private readonly finishColor = new THREE.Color(
    VISUAL_PARTICLE_COLORS.finish,
  );
  private readonly timeoutColor = new THREE.Color(
    VISUAL_PARTICLE_COLORS.timeout,
  );
  private readonly scratch = new THREE.Vector3();
  private readonly bursts: Record<BurstType, BurstEmission>;

  constructor() {
    const spark = this.resources.trackTexture(makeSparkTexture());
    const streak = this.resources.trackTexture(makeStreakTexture());
    const feather = this.resources.trackTexture(makeFeatherTexture());

    this.windPool = new ParticlePool({
      max: VISUAL_PARTICLE_MAX_COUNT,
      texture: streak,
      ...VISUAL_PARTICLE_POOLS.wind,
    });
    this.burstPool = new ParticlePool({
      max: VISUAL_PARTICLE_MAX_COUNT,
      texture: spark,
      ...VISUAL_PARTICLE_POOLS.burst,
    });
    this.featherPool = new ParticlePool({
      max: VISUAL_PARTICLE_MAX_COUNT,
      texture: feather,
      ...VISUAL_PARTICLE_POOLS.feather,
    });

    this.group.add(this.windPool.points, this.burstPool.points, this.featherPool.points);

    this.bursts = {
      ring: {
        color: this.ringColor,
        minSpeed: 2.5,
        maxSpeed: 5,
        forwardBias: 1.5,
        lifetime: VISUAL_BURST_LIFETIME,
      },
      apple: {
        color: this.appleColor,
        minSpeed: 1.5,
        maxSpeed: 3,
        forwardBias: 0.5,
        lifetime: VISUAL_BURST_LIFETIME * 0.85,
      },
      finish: {
        color: this.finishColor,
        minSpeed: 3,
        maxSpeed: 6,
        forwardBias: 1,
        lifetime: VISUAL_BURST_LIFETIME * 1.4,
      },
      timeout: {
        color: this.timeoutColor,
        minSpeed: 0.5,
        maxSpeed: 1.5,
        forwardBias: 0,
        lifetime: VISUAL_BURST_LIFETIME * 1.6,
      },
    };
  }

  emit(count: number, position: THREE.Vector3, type: ParticleType): void {
    switch (type) {
      case "wind":
        this.emitWind(count, position);
        break;
      case "ring":
      case "apple":
      case "finish":
      case "timeout":
        this.emitBurst(count, position, this.bursts[type]);
        break;
      case "feather":
        this.emitFeathers(count, position);
        break;
    }
  }

  update(dt: number): void {
    this.windPool.update(dt);
    this.burstPool.update(dt);
    this.featherPool.update(dt);
  }

  reset(): void {
    this.windPool.reset();
    this.burstPool.reset();
    this.featherPool.reset();
  }

  dispose(): void {
    this.windPool.dispose();
    this.burstPool.dispose();
    this.featherPool.dispose();
    this.resources.dispose();
  }

  private emitWind(count: number, position: THREE.Vector3): void {
    for (let i = 0; i < count; i++) {
      const brightness = 0.55 + Math.random() * 0.45;
      this.windPool.spawn({
        position: {
          x: position.x + (Math.random() - 0.5) * 1.4,
          y: position.y + (Math.random() - 0.5) * 1.0,
          z: position.z - 1.6,
        },
        velocity: {
          x: (Math.random() - 0.5) * 0.6,
          y: (Math.random() - 0.5) * 0.6,
          z: -2 - Math.random() * 2.5,
        },
        color: {
          r: this.windColor.r * brightness,
          g: this.windColor.g * brightness,
          b: this.windColor.b * brightness,
        },
        lifetime: VISUAL_WIND_LIFETIME * (0.8 + Math.random() * 0.4),
      });
    }
  }

  private emitBurst(
    count: number,
    position: THREE.Vector3,
    { color, minSpeed, maxSpeed, forwardBias, lifetime }: BurstEmission,
  ): void {
    for (let i = 0; i < count; i++) {
      randomDirection(this.scratch);
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      const brightness = 0.7 + Math.random() * 0.3;
      this.burstPool.spawn({
        position: { x: position.x, y: position.y, z: position.z },
        velocity: {
          x: this.scratch.x * speed,
          y: this.scratch.y * speed,
          z: this.scratch.z * speed + forwardBias,
        },
        color: {
          r: color.r * brightness,
          g: color.g * brightness,
          b: color.b * brightness,
        },
        lifetime: lifetime * (0.8 + Math.random() * 0.4),
      });
    }
  }

  private emitFeathers(count: number, position: THREE.Vector3): void {
    for (let i = 0; i < count; i++) {
      const color = i % 2 === 0 ? this.featherA : this.featherB;
      const side = i % 2 === 0 ? -1 : 1;
      const brightness = 0.7 + Math.random() * 0.3;
      this.featherPool.spawn({
        position: {
          x: position.x + side * 0.5,
          y: position.y - 0.1 + (Math.random() - 0.5) * 0.3,
          z: position.z,
        },
        velocity: {
          x: side * (0.5 + Math.random()),
          y: 0.5 + Math.random() * 0.7,
          z: -0.5 - Math.random(),
        },
        color: {
          r: color.r * brightness,
          g: color.g * brightness,
          b: color.b * brightness,
        },
        lifetime: VISUAL_FEATHER_LIFETIME * (0.8 + Math.random() * 0.4),
      });
    }
  }
}
