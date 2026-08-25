import type { FlightInput } from "../types";
import { FLIGHT } from "../constants";
import type { Bird } from "../bird/Bird";
import type { FlightTunnel } from "../course/FlightTunnel";

export class FlightController {
  private smoothedFlap = 0;
  private smoothedSteerX = 0;
  private smoothedSteerY = 0;
  private speedMultiplier = 1;
  private tunnel: FlightTunnel | null = null;

  setTunnel(tunnel: FlightTunnel): void {
    this.tunnel = tunnel;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(multiplier, 0);
  }

  update(bird: Bird, input: FlightInput, dt: number): void {
    const alpha = 1 - Math.exp(-18 * dt);

    this.smoothedFlap += (input.flapEnergy - this.smoothedFlap) * alpha;
    this.smoothedSteerX += (input.bodySteerX - this.smoothedSteerX) * alpha;
    this.smoothedSteerY += (input.bodySteerY - this.smoothedSteerY) * alpha;

    const vel = bird.velocity;
    const flap = Math.max(this.smoothedFlap, input.flapEnergy * 0.75);

    let targetX = this.smoothedSteerX * FLIGHT.lateralSpeed;

    // State-driven vertical model: keys override, neutral sinks at a constant
    // rate, glide/bank hold altitude, and flap pumps add lift on top.
    let targetY: number;
    if (input.bodySteerY !== 0) {
      targetY = this.smoothedSteerY * FLIGHT.verticalSpeed;
    } else if (input.gestureClass === "neutral") {
      targetY = -FLIGHT.fallSpeed;
    } else {
      targetY = 0;
    }

    targetY += flap * FLIGHT.flapLift;

    if (this.tunnel) {
      const guide = this.tunnel.getGuidanceForce(bird.position);
      const centered =
        Math.abs(this.smoothedSteerX) < 0.08 && Math.abs(this.smoothedSteerY) < 0.08;
      const guideStrength = centered
        ? FLIGHT.autoCenterStrength
        : FLIGHT.autoCenterStrength * 0.35;
      targetX += guide.x * guideStrength;
      targetY += guide.y * guideStrength;
    }

    vel.x += (targetX - vel.x) * alpha;
    vel.y += (targetY - vel.y) * alpha;
    vel.z = FLIGHT.forwardSpeed * this.speedMultiplier;

    bird.position.x += vel.x * dt;
    bird.position.y += vel.y * dt;
    bird.position.z += vel.z * dt;

    if (this.tunnel) {
      this.tunnel.constrain(bird.position, vel);
    }

    bird.update(dt, flap);
  }

  reset(): void {
    this.smoothedFlap = 0;
    this.smoothedSteerX = 0;
    this.smoothedSteerY = 0;
    this.speedMultiplier = 1;
  }
}
