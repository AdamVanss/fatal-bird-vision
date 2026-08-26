import * as THREE from "three";
import type { Bird } from "./Bird";

/** Cinematic chase camera. Bird orientation never rolls the camera. */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3(0, 2.15, -7.4);
  private readonly lookAhead = new THREE.Vector3(0, 0.15, 11);
  private readonly currentPos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();
  private initialized = false;
  private shake = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(bird: Bird, dt: number): void {
    const targetPos = bird.position.clone().add(this.offset);
    const targetLook = bird.position.clone().add(this.lookAhead);

    if (!this.initialized) {
      this.currentPos.copy(targetPos);
      this.currentLook.copy(targetLook);
      this.initialized = true;
    }

    const smooth = 1 - Math.pow(0.08, dt);
    this.currentPos.lerp(targetPos, smooth);
    this.currentLook.lerp(targetLook, smooth);

    this.shake *= Math.exp(-10 * dt);
    if (this.shake > 0.008) {
      this.currentPos.x += (Math.random() - 0.5) * this.shake;
      this.currentPos.y += (Math.random() - 0.5) * this.shake * 0.7;
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  punch(amount = 0.55): void {
    this.shake = Math.max(this.shake, amount);
  }

  snapTo(bird: Bird): void {
    this.currentPos.copy(bird.position).add(this.offset);
    this.currentLook.copy(bird.position).add(this.lookAhead);
    this.initialized = true;
    this.shake = 0;
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }
}
