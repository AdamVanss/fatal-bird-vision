import * as THREE from "three";
import type { FlightInput } from "../types";
import {
  FLIGHT,
  VISUAL_FEATHER_COOLDOWN,
  VISUAL_FEATHER_FLAP_THRESHOLD,
  VISUAL_PARTICLE_COUNTS,
  VISUAL_WIND_INTENSITY_BLEND,
  VISUAL_WIND_SPEED_THRESHOLD,
} from "../constants";
import type { Bird } from "../bird/Bird";
import type { ParticleSystem } from "./ParticleSystem";
import type { AudioManager } from "../audio/AudioManager";
import { EdgeTrigger } from "../utils/EdgeTrigger";

export class FlightEffects {
  private featherCooldown = 0;
  private readonly flapEdge = new EdgeTrigger("relax");
  private readonly bird: Bird;
  private readonly particles: ParticleSystem;
  private readonly audio: AudioManager;

  constructor(
    bird: Bird,
    particles: ParticleSystem,
    audio: AudioManager,
  ) {
    this.bird = bird;
    this.particles = particles;
    this.audio = audio;
  }

  update(dt: number, input: FlightInput): void {
    this.featherCooldown = Math.max(0, this.featherCooldown - dt);
    const flapping = input.flapEnergy > VISUAL_FEATHER_FLAP_THRESHOLD;
    // One flap per rising edge over the threshold, not on every held frame.
    if (this.flapEdge.update(flapping) && this.featherCooldown === 0) {
      this.flapEdge.acknowledge();
      this.audio.playFlap();
      this.particles.emit(
        VISUAL_PARTICLE_COUNTS.feather,
        this.bird.position,
        "feather",
      );
      this.featherCooldown = VISUAL_FEATHER_COOLDOWN;
    }

    const lateralSpeed = Math.hypot(this.bird.velocity.x, this.bird.velocity.y);
    const blend = VISUAL_WIND_INTENSITY_BLEND;
    const intensity = THREE.MathUtils.clamp(
      input.flapEnergy * blend.flapEnergyWeight +
        (lateralSpeed / FLIGHT.verticalSpeed) * blend.motionWeight,
      0,
      1,
    );
    if (intensity > VISUAL_WIND_SPEED_THRESHOLD) {
      this.particles.emit(
        VISUAL_PARTICLE_COUNTS.wind,
        this.bird.position,
        "wind",
      );
    }
  }

  reset(): void {
    this.featherCooldown = 0;
    this.flapEdge.reset(false);
  }
}