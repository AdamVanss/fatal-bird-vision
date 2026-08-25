import * as THREE from "three";
import {
  VISUAL_BIRD_BELLY_COLOR,
  VISUAL_BIRD_BEAK_COLOR,
  VISUAL_BIRD_COLOR,
  VISUAL_BIRD_EYE_COLOR,
  VISUAL_BIRD_WING_COLOR,
} from "../constants";
import { ResourceTracker } from "../utils/ResourceTracker";
import { enableShadows } from "../utils/three";

interface BirdMaterials {
  body: THREE.MeshStandardMaterial;
  wing: THREE.MeshStandardMaterial;
  belly: THREE.MeshStandardMaterial;
  beak: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

/** Procedural fallback bird; faces +Z (flight direction). */
export class BirdModel {
  readonly group = new THREE.Group();

  private readonly leftWing: THREE.Group;
  private readonly rightWing: THREE.Group;
  private readonly tail: THREE.Group;
  private readonly bobGroup = new THREE.Group();
  private readonly resources = new ResourceTracker();
  private flapPhase = 0;

  constructor() {
    const mats = this.buildMaterials();

    const body = new THREE.Mesh(this.resources.trackGeometry(new THREE.IcosahedronGeometry(0.42, 0)), mats.body);
    body.scale.set(0.9, 0.8, 1.5);

    const belly = new THREE.Mesh(this.resources.trackGeometry(new THREE.IcosahedronGeometry(0.3, 0)), mats.belly);
    belly.scale.set(0.85, 0.62, 1.3);
    belly.position.set(0, -0.12, 0.05);

    const head = new THREE.Mesh(this.resources.trackGeometry(new THREE.IcosahedronGeometry(0.19, 0)), mats.body);
    head.position.set(0, 0.18, 0.52);

    const beak = new THREE.Mesh(this.resources.trackGeometry(new THREE.ConeGeometry(0.06, 0.24, 5)), mats.beak);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.15, 0.72);

    const eyeGeo = this.resources.trackGeometry(new THREE.SphereGeometry(0.035, 6, 6));
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(eyeGeo, mats.eye);
      eye.position.set(side * 0.12, 0.24, 0.6);
      this.bobGroup.add(eye);
    }

    // Wings pivot at the shoulders so rotation.z flaps the whole span
    const innerWingGeo = this.resources.trackGeometry(new THREE.BoxGeometry(0.55, 0.05, 0.42));
    const tipWingGeo = this.resources.trackGeometry(new THREE.BoxGeometry(0.45, 0.04, 0.28));
    this.tail = this.buildTail(mats.wing);
    this.leftWing = this.buildWing(-1, mats.wing, innerWingGeo, tipWingGeo);
    this.rightWing = this.buildWing(1, mats.wing, innerWingGeo, tipWingGeo);

    this.bobGroup.add(body, belly, head, beak, this.tail);
    this.group.add(this.bobGroup, this.leftWing, this.rightWing);
    enableShadows(this.group);
  }

  private buildMaterials(): BirdMaterials {
    const standard = (
      color: number,
      roughness: number,
      flatShading = false,
    ) =>
      this.resources.trackMaterial(
        new THREE.MeshStandardMaterial({ color, roughness, flatShading }),
      );
    return {
      body: standard(VISUAL_BIRD_COLOR, 0.6, true),
      wing: standard(VISUAL_BIRD_WING_COLOR, 0.55, true),
      belly: standard(VISUAL_BIRD_BELLY_COLOR, 0.7, true),
      beak: standard(VISUAL_BIRD_BEAK_COLOR, 0.45, true),
      eye: standard(VISUAL_BIRD_EYE_COLOR, 0.35),
    };
  }

  private buildTail(wingMat: THREE.Material): THREE.Group {
    const tail = new THREE.Group();
    const centerFeather = new THREE.Mesh(
      this.resources.trackGeometry(new THREE.BoxGeometry(0.34, 0.05, 0.42)),
      wingMat,
    );
    centerFeather.position.set(0, 0.05, -0.6);
    centerFeather.rotation.x = 0.25;
    tail.add(centerFeather);

    const sideGeo = this.resources.trackGeometry(new THREE.BoxGeometry(0.14, 0.04, 0.34));
    for (const side of [-1, 1] as const) {
      const sideFeather = new THREE.Mesh(sideGeo, wingMat);
      sideFeather.position.set(side * 0.2, 0.05, -0.56);
      sideFeather.rotation.set(0.25, side * 0.4, 0);
      tail.add(sideFeather);
    }
    return tail;
  }

  private buildWing(
    side: 1 | -1,
    wingMat: THREE.Material,
    innerGeo: THREE.BufferGeometry,
    tipGeo: THREE.BufferGeometry,
  ): THREE.Group {
    const wing = new THREE.Group();
    wing.position.set(side * 0.28, 0.14, 0.02);

    const inner = new THREE.Mesh(innerGeo, wingMat);
    inner.position.set(side * 0.28, 0, 0);

    const tip = new THREE.Mesh(tipGeo, wingMat);
    tip.position.set(side * 0.68, 0, 0.06);
    tip.rotation.y = side * 0.35;

    wing.add(inner, tip);
    return wing;
  }

  update(dt: number, flapEnergy: number): void {
    const energy = THREE.MathUtils.clamp(flapEnergy, 0, 1);
    this.flapPhase += dt * (2.2 + energy * 5.8);
    const amplitude = 0.18 + energy * 0.4;
    const wingAngle = Math.sin(this.flapPhase) * amplitude;
    this.leftWing.rotation.z = -wingAngle;
    this.rightWing.rotation.z = wingAngle;
    this.bobGroup.position.y = Math.sin(this.flapPhase) * 0.02;
    this.tail.rotation.y = Math.sin(this.flapPhase * 0.5) * 0.06;
  }

  dispose(): void {
    this.resources.dispose();
  }
}
