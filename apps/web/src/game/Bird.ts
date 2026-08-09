import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BIRD_MODEL_URL, FLIGHT } from "../constants";

/** Mirada GLTF default: head +X, up +Y — orientation 1 (+X face), no rotation */
function alignModelForFlight(model: THREE.Object3D): void {
  model.rotation.set(0, 0, 0);
}

export class Bird {
  readonly group = new THREE.Group();
  private readonly modelPivot = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private flapAction: THREE.AnimationAction | null = null;
  private readonly fallbackGroup = new THREE.Group();
  private flapPhase = 0;
  private leftWingFallback: THREE.Mesh | null = null;
  private rightWingFallback: THREE.Mesh | null = null;
  private loaded = false;

  velocity = new THREE.Vector3(0, 0, FLIGHT.forwardSpeed);

  constructor() {
    this.group.rotation.set(0, 0, 0);
    this.group.add(this.modelPivot);
    this.buildFallbackBird();
    alignModelForFlight(this.fallbackGroup);
  }

  async loadModel(): Promise<void> {
    if (this.loaded) return;
    try {
      const gltf = await new GLTFLoader().loadAsync(BIRD_MODEL_URL);
      this.modelPivot.remove(this.fallbackGroup);

      const model = gltf.scene;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      model.scale.setScalar(0.038);
      alignModelForFlight(model);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      this.modelPivot.add(model);

      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        this.flapAction = this.mixer.clipAction(gltf.animations[0]);
        this.flapAction.play();
        this.flapAction.timeScale = 1.2;
      }

      this.loaded = true;
    } catch (err) {
      console.warn("Bird model failed to load, using fallback mesh:", err);
    }
  }

  private buildFallbackBird(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4a7c59,
      roughness: 0.55,
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x6b4fa0,
      roughness: 0.5,
    });

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 10),
      bodyMat,
    );
    body.scale.set(1, 0.85, 1.35);
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), bodyMat);
    head.position.set(0, 0.15, 0.55);
    head.castShadow = true;

    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0xf4a020 }),
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1, 0.78);

    const leftWing = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.5, 1.0),
      wingMat,
    );
    leftWing.position.set(-0.42, 0.05, 0);
    leftWing.castShadow = true;

    const rightWing = leftWing.clone();
    rightWing.position.x = 0.42;

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.45, 4),
      wingMat,
    );
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0, -0.65);

    this.leftWingFallback = leftWing;
    this.rightWingFallback = rightWing;
    this.fallbackGroup.add(body, head, beak, leftWing, rightWing, tail);
    this.modelPivot.add(this.fallbackGroup);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  updateVisuals(dt: number, flapEnergy: number): void {
    this.group.rotation.set(0, 0, 0);

    if (this.mixer && this.flapAction) {
      this.flapAction.timeScale = 0.6 + flapEnergy * 2.2;
      this.mixer.update(dt);
    } else if (this.leftWingFallback && this.rightWingFallback) {
      this.flapPhase += dt * (3 + flapEnergy * 6);
      const wingFlap = Math.sin(this.flapPhase) * (0.12 + flapEnergy * 0.35);
      this.leftWingFallback.rotation.z = wingFlap;
      this.rightWingFallback.rotation.z = -wingFlap;
    }
  }
}
