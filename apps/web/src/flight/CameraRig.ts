import * as THREE from "three";
import { CAMERA_RIG } from "../constants";
import type { Bird } from "../bird/Bird";

/** Fixed chase camera — bird orientation never affects the camera */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3(
    CAMERA_RIG.offset.x,
    CAMERA_RIG.offset.y,
    CAMERA_RIG.offset.z,
  );
  private readonly lookAhead = new THREE.Vector3(
    CAMERA_RIG.lookAhead.x,
    CAMERA_RIG.lookAhead.y,
    CAMERA_RIG.lookAhead.z,
  );
  private readonly currentPos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Snap instantly to the bird's spawn view — used on (re)start so the rig
   *  doesn't lerp across the map from the previous run's finish position */
  reset(bird: Bird): void {
    this.currentPos.copy(bird.position).add(this.offset);
    this.currentLook.copy(bird.position).add(this.lookAhead);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  update(bird: Bird, dt: number): void {
    const targetPos = bird.position.clone().add(this.offset);
    const targetLook = bird.position.clone().add(this.lookAhead);

    const smooth = 1 - Math.pow(CAMERA_RIG.smoothingBase, dt);
    this.currentPos.lerp(targetPos, smooth);
    this.currentLook.lerp(targetLook, smooth);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }
}
