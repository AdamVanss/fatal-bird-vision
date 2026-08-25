import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BIRD_MODEL_URL, FLIGHT, VISUAL_BIRD_GLTF_SCALE } from "../constants";
import { enableShadows, disposeObjectTree } from "../utils/three";
import { BirdModel } from "./BirdModel";

export class Bird {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private flapAction: THREE.AnimationAction | null = null;
  private readonly fallbackModel = new BirdModel();
  private gltfScene: THREE.Object3D | null = null;
  private loaded = false;

  velocity = new THREE.Vector3(0, 0, FLIGHT.forwardSpeed);

  constructor() {
    this.group.add(this.fallbackModel.group);
  }

  async loadModel(): Promise<void> {
    if (this.loaded) return;
    try {
      const gltf = await new GLTFLoader().loadAsync(BIRD_MODEL_URL);
      this.group.remove(this.fallbackModel.group);

      const model = gltf.scene;
      enableShadows(model);
      model.scale.setScalar(VISUAL_BIRD_GLTF_SCALE);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      this.group.add(model);
      this.gltfScene = model;

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

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(dt: number, flapEnergy: number): void {
    if (this.mixer && this.flapAction) {
      this.flapAction.timeScale = 0.6 + flapEnergy * 2.2;
      this.mixer.update(dt);
    } else {
      this.fallbackModel.update(dt, flapEnergy);
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    disposeObjectTree(this.gltfScene);
    this.gltfScene = null;
    this.fallbackModel.dispose();
  }
}
