import * as THREE from "three";
import {
  VISUAL_AMBIENT_INTENSITY,
  VISUAL_FOG_COLOR,
  VISUAL_FOG_DENSITY,
  VISUAL_LIGHT_END_COLOR,
  VISUAL_LIGHT_END_PROGRESS,
  VISUAL_LIGHT_MID_COLOR,
  VISUAL_LIGHT_MID_PROGRESS,
  VISUAL_LIGHT_SHADOW,
  VISUAL_LIGHT_START_COLOR,
  VISUAL_LIGHT_TRANSITION_SPEED,
} from "../constants";

interface LightKeyframe {
  at: number;
  color: THREE.Color;
}

/**
 * Owns the scene's lighting — the single place lights are created. One dynamic
 * directional light whose color tracks course progress (cool blue → warm orange
 * → deep purple), a low ambient so emissive/neon materials pop, and exponential
 * fog for depth.
 */
export class LightingManager {
  private readonly scene: THREE.Scene;
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly keyframes: LightKeyframe[];
  private readonly currentColor: THREE.Color;
  private readonly targetColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const shadow = VISUAL_LIGHT_SHADOW;
    this.sun = new THREE.DirectionalLight(VISUAL_LIGHT_START_COLOR, 1.0);
    this.sun.position.set(shadow.sunPosition.x, shadow.sunPosition.y, shadow.sunPosition.z);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
    this.sun.shadow.camera.near = shadow.cameraNear;
    this.sun.shadow.camera.far = shadow.cameraFar;
    this.sun.shadow.camera.left = -shadow.frustumHalfExtent;
    this.sun.shadow.camera.right = shadow.frustumHalfExtent;
    this.sun.shadow.camera.top = shadow.frustumHalfExtent;
    this.sun.shadow.camera.bottom = -shadow.frustumHalfExtent;

    this.ambient = new THREE.AmbientLight(0xffffff, VISUAL_AMBIENT_INTENSITY);
    scene.add(this.sun, this.ambient);

    scene.fog = new THREE.FogExp2(VISUAL_FOG_COLOR, VISUAL_FOG_DENSITY);

    this.keyframes = [
      { at: 0, color: new THREE.Color(VISUAL_LIGHT_START_COLOR) },
      { at: VISUAL_LIGHT_MID_PROGRESS, color: new THREE.Color(VISUAL_LIGHT_MID_COLOR) },
      { at: VISUAL_LIGHT_END_PROGRESS, color: new THREE.Color(VISUAL_LIGHT_END_COLOR) },
    ];
    this.currentColor = this.keyframes[0].color.clone();
  }

  update(progressRatio: number, dt: number): void {
    this.sampleKeyframes(THREE.MathUtils.clamp(progressRatio, 0, 1), this.targetColor);
    const smoothing = 1 - Math.exp(-VISUAL_LIGHT_TRANSITION_SPEED * dt);
    this.currentColor.lerp(this.targetColor, smoothing);
    this.sun.color.copy(this.currentColor);
  }

  reset(): void {
    this.currentColor.copy(this.keyframes[0].color);
    this.sun.color.copy(this.currentColor);
  }

  dispose(): void {
    this.scene.remove(this.sun, this.ambient);
    this.sun.dispose();
    this.ambient.dispose();
  }

  private sampleKeyframes(progress: number, out: THREE.Color): THREE.Color {
    const frames = this.keyframes;
    if (progress <= frames[0].at) return out.copy(frames[0].color);
    for (let i = 1; i < frames.length; i++) {
      if (progress <= frames[i].at) {
        const prev = frames[i - 1];
        const next = frames[i];
        const t = (progress - prev.at) / (next.at - prev.at);
        return out.copy(prev.color).lerp(next.color, t);
      }
    }
    return out.copy(frames[frames.length - 1].color);
  }
}
