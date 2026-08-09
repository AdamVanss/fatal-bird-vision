import type { FlightInput } from "../types";
import { FLIGHT } from "../constants";
import type { Bird } from "./Bird";
import type { FlightTunnel } from "./FlightTunnel";

/** Rail-style flight: bird always faces +Z; body-steer moves it on X/Y */
export class FlightController {
  private smoothedFlap = 0;
  private smoothedSteerX = 0;
  private smoothedSteerY = 0;
  private tunnel: FlightTunnel | null = null;

  setTunnel(tunnel: FlightTunnel): void {
    this.tunnel = tunnel;
  }

  update(bird: Bird, input: FlightInput, dt: number): void {
    const alpha = 1 - Math.exp(-18 * dt);

    this.smoothedFlap += (input.flapEnergy - this.smoothedFlap) * alpha;
    this.smoothedSteerX += (input.bodySteerX - this.smoothedSteerX) * alpha;
    this.smoothedSteerY += (input.bodySteerY - this.smoothedSteerY) * alpha;

    const vel = bird.velocity;
    const flap = Math.max(this.smoothedFlap, input.flapEnergy * 0.75);

    let targetX = this.smoothedSteerX * FLIGHT.lateralSpeed;
    let targetY = this.smoothedSteerY * FLIGHT.verticalSpeed;

    targetY += flap * FLIGHT.verticalSpeed * 0.45;

    if (input.gestureClass === "glide") {
      targetY += FLIGHT.glideLift * 0.35;
    }

    targetY += FLIGHT.gravity * 0.25;

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
    vel.z = FLIGHT.forwardSpeed;

    bird.position.x += vel.x * dt;
    bird.position.y += vel.y * dt;
    bird.position.z += vel.z * dt;

    if (this.tunnel) {
      this.tunnel.constrain(bird.position, vel);
      this.tunnel.constrain(bird.position, vel);
    }

    bird.updateVisuals(dt, flap);
  }

  reset(): void {
    this.smoothedFlap = 0;
    this.smoothedSteerX = 0;
    this.smoothedSteerY = 0;
  }
}
