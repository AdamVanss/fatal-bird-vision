import * as THREE from "three";
import { ResourceTracker } from "../utils/ResourceTracker";

/** Dead particles are parked out of sight below the world */
export const PARK_Y = -1000;

export interface PointPoolOptions {
  max: number;
  size: number;
  texture: THREE.Texture;
}

/** Canvas → sRGB sprite texture, shared by every additive point pool */
export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Fixed-cap ring-buffer particle pool rendered as a single additive
 * THREE.Points draw call. Additive blending means fading the vertex color
 * toward black fades the particle out — no per-particle alpha needed.
 *
 * This base owns the ring buffer, death parking, GPU dirty-flagging and
 * teardown; subclasses provide per-particle physics and coloring through
 * `stepParticle`.
 */
export abstract class PointPool {
  readonly points: THREE.Points;

  protected readonly max: number;
  protected readonly positions: Float32Array;
  protected readonly colors: Float32Array;
  protected readonly velocities: Float32Array;
  protected readonly life: Float32Array;
  protected readonly maxLife: Float32Array;

  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly colorAttribute: THREE.BufferAttribute;
  private readonly tracker = new ResourceTracker();
  private cursor = 0;

  protected constructor(options: PointPoolOptions) {
    this.max = options.max;
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.velocities = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    for (let i = 0; i < this.max; i++) {
      this.park(i);
    }

    const geometry = this.tracker.trackGeometry(new THREE.BufferGeometry());
    this.positionAttribute = new THREE.BufferAttribute(
      this.positions,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    geometry.setAttribute("position", this.positionAttribute);
    geometry.setAttribute("color", this.colorAttribute);

    const material = this.tracker.trackMaterial(
      new THREE.PointsMaterial({
        size: options.size,
        map: options.texture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    );

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      dirty = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.park(i);
        continue;
      }
      this.stepParticle(i, i * 3, dt);
    }
    if (dirty) {
      this.positionAttribute.needsUpdate = true;
      this.colorAttribute.needsUpdate = true;
    }
  }

  reset(): void {
    for (let i = 0; i < this.max; i++) {
      this.life[i] = 0;
      this.park(i);
    }
    this.cursor = 0;
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.tracker.dispose();
  }

  protected abstract stepParticle(
    index: number,
    offset: number,
    dt: number,
  ): void;

  protected nextSlot(): number {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    return i;
  }

  protected moveWithVelocity(offset: number, dt: number): void {
    this.positions[offset] += this.velocities[offset] * dt;
    this.positions[offset + 1] += this.velocities[offset + 1] * dt;
    this.positions[offset + 2] += this.velocities[offset + 2] * dt;
  }

  private park(i: number): void {
    this.positions[i * 3 + 1] = PARK_Y;
    this.colors[i * 3] = 0;
    this.colors[i * 3 + 1] = 0;
    this.colors[i * 3 + 2] = 0;
  }
}
