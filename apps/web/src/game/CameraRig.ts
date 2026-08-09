import * as THREE from "three";
import type { Bird } from "./Bird";

/** Fixed chase camera — bird orientation never affects the camera */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3(0, 1.5, -5.5);
  private readonly lookAhead = new THREE.Vector3(0, 0, 6);
  private readonly currentPos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(bird: Bird, dt: number): void {
    const targetPos = bird.position.clone().add(this.offset);
    const targetLook = bird.position.clone().add(this.lookAhead);

    const smooth = 1 - Math.pow(0.001, dt);
    this.currentPos.lerp(targetPos, smooth);
    this.currentLook.lerp(targetLook, smooth);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }
}
