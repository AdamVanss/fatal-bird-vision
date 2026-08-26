import * as THREE from "three";
import { BIRD_FLIGHT_SIZE, BIRD_SKINS, FLIGHT, type BirdSkinId } from "../constants";
import { birdSkinById, instantiateBird, loadBirdGltf } from "./birdKit";

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
  private skinRoot: THREE.Object3D | null = null;
  private skinId: BirdSkinId = BIRD_SKINS[0].id;
  private readonly nightFill: THREE.PointLight;

  velocity = new THREE.Vector3(0, 0, FLIGHT.forwardSpeed);

  constructor() {
    this.group.rotation.set(0, 0, 0);
    this.group.add(this.modelPivot);
    this.nightFill = new THREE.PointLight(0xffe6c4, 0, 16, 1.7);
    this.nightFill.castShadow = false;
    this.nightFill.position.set(0, 0.6, 0.4);
    this.group.add(this.nightFill);
    this.buildFallbackBird();
    alignModelForFlight(this.fallbackGroup);
  }

  setNightFill(amount: number): void {
    this.nightFill.intensity = amount * 2.6;
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = amount * 0.55;
        }
      }
    });
  }

  async loadModel(): Promise<void> {
    await this.setSkin(this.skinId);
  }

  async setSkin(id: BirdSkinId): Promise<void> {
    const skin = birdSkinById(id);
    try {
      const gltf = await loadBirdGltf(skin.url);
      if (this.skinRoot) this.modelPivot.remove(this.skinRoot);
      this.modelPivot.remove(this.fallbackGroup);
      const { root, mixer } = instantiateBird(gltf, skin.tint, BIRD_FLIGHT_SIZE, false, "x");
      alignModelForFlight(root);
      this.skinRoot = root;
      this.mixer = mixer;
      this.flapAction = mixer?.existingAction(gltf.animations[0]) ?? mixer?.clipAction(gltf.animations[0]) ?? null;
      if (this.flapAction) this.flapAction.timeScale = 1.15;
      this.modelPivot.add(root);
      this.skinId = id;
    } catch (err) {
      console.warn("Bird model failed to load, using fallback mesh:", err);
      if (!this.fallbackGroup.parent) this.modelPivot.add(this.fallbackGroup);
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
    this.fallbackGroup.scale.setScalar(1.35);
    this.modelPivot.add(this.fallbackGroup);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  updateVisuals(dt: number, flapEnergy: number, bank = 0): void {
    this.group.rotation.set(0, 0, 0);
    this.modelPivot.rotation.z = THREE.MathUtils.lerp(
      this.modelPivot.rotation.z,
      -bank * 0.28,
      1 - Math.exp(-8 * dt),
    );

    if (this.mixer && this.flapAction) {
      this.flapAction.timeScale = 0.85 + flapEnergy * 0.6;
      this.mixer.update(dt);
    } else if (this.leftWingFallback && this.rightWingFallback) {
      this.flapPhase += dt * (3 + flapEnergy * 4);
      const wingFlap = Math.sin(this.flapPhase) * (0.12 + flapEnergy * 0.2);
      this.leftWingFallback.rotation.z = wingFlap;
      this.rightWingFallback.rotation.z = -wingFlap;
    }
  }
}
