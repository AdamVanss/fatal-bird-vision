import * as THREE from "three";
import type { FlightInput } from "../types";
import { CANYON, FLIGHT } from "../constants";
import type { Bird } from "./Bird";
import type { FlightTunnel } from "./FlightTunnel";

/** Rail flight: body offset maps to a target X/Y in the canyon */
export class FlightController {
  private smoothedSteerX = 0;
  private smoothedSteerY = 0;
  private tunnel: FlightTunnel | null = null;
  private readonly fallbackCenter = new THREE.Vector3();
  private forwardSpeed: number = FLIGHT.forwardSpeed;
  private burstLeft = 0;
  private burstMax = 0;
  private burstExtra = 0;
  private halted = false;

  setTunnel(tunnel: FlightTunnel): void {
    this.tunnel = tunnel;
  }

  setForwardSpeed(speed: number): void {
    this.forwardSpeed = speed;
  }

  setHalted(halted: boolean): void {
    this.halted = halted;
  }

  boost(seconds: number, extra: number): void {
    this.burstMax = seconds;
    this.burstLeft = seconds;
    this.burstExtra = extra;
  }

  update(bird: Bird, input: FlightInput, dt: number): void {
    const steerAlpha = 1 - Math.exp(-10 * dt);
    this.smoothedSteerX += (input.bodySteerX - this.smoothedSteerX) * steerAlpha;
    this.smoothedSteerY += (input.bodySteerY - this.smoothedSteerY) * steerAlpha;

    const center = this.tunnel
      ? this.tunnel.getCenterAt(bird.position.z)
      : this.fallbackCenter.set(0, CANYON.flightHeight, bird.position.z);

    const targetX = center.x + this.smoothedSteerX * CANYON.playHalfWidth;
    const targetY = center.y + this.smoothedSteerY * CANYON.playHalfHeight;

    const follow = 1 - Math.exp(-FLIGHT.followLerp * dt);
    if (this.burstLeft > 0) this.burstLeft = Math.max(0, this.burstLeft - dt);
    const burst =
      this.burstMax > 0 && this.burstLeft > 0
        ? this.burstExtra * (this.burstLeft / this.burstMax)
        : 0;
    const speed = this.halted ? 0 : this.forwardSpeed * (1 + burst);

    bird.position.x += (targetX - bird.position.x) * follow;
    bird.position.y += (targetY - bird.position.y) * follow;
    bird.position.z += speed * dt;

    bird.velocity.set(
      (targetX - bird.position.x) / Math.max(dt, 0.001),
      (targetY - bird.position.y) / Math.max(dt, 0.001),
      speed,
    );

    if (this.tunnel) {
      this.tunnel.constrain(bird.position, bird.velocity);
    }

    bird.updateVisuals(dt, 0.35, this.smoothedSteerX);
  }

  reset(): void {
    this.smoothedSteerX = 0;
    this.smoothedSteerY = 0;
    this.burstLeft = 0;
    this.burstMax = 0;
    this.burstExtra = 0;
    this.halted = false;
  }
}
