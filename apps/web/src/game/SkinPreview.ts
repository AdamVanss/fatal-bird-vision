import * as THREE from "three";
import { BIRD_PREVIEW_SIZE, BIRD_SKINS, type BirdSkinId } from "../constants";
import { birdSkinById, instantiateBird, loadBirdGltf } from "./birdKit";

export class SkinPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  private readonly pivot = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private current: THREE.Object3D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private spin = 0;
  private active = true;
  private resizeObs: ResizeObserver | null = null;

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.resizeObs?.disconnect();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    this.renderer = renderer;

    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x3a3228, 1.15));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8eb4d8, 0.55);
    fill.position.set(-4, 2, -2);
    this.scene.add(fill);

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 48),
      new THREE.MeshStandardMaterial({
        color: 0x101010,
        roughness: 0.82,
        metalness: 0.08,
        emissive: 0x5fd832,
        emissiveIntensity: 0.08,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -1.05;
    this.scene.add(pad);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.74, 1.88, 48),
      new THREE.MeshBasicMaterial({
        color: 0x5fd832,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.04;
    this.scene.add(ring);

    this.scene.add(this.pivot);
    this.camera.position.set(0, 1.05, 4.7);
    this.camera.lookAt(0, 0.7, 0);
    this.resize();
  }

  resize(): void {
    if (!this.renderer || !this.canvas) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setActive(on: boolean): void {
    this.active = on;
  }

  async show(id: BirdSkinId): Promise<void> {
    const skin = birdSkinById(id);
    const gltf = await loadBirdGltf(skin.url);
    if (this.current) this.pivot.remove(this.current);
    this.mixer = null;
    const { root, mixer } = instantiateBird(gltf, skin.tint, BIRD_PREVIEW_SIZE, true, "y");
    root.position.y = -1.05;
    this.current = root;
    this.mixer = mixer;
    this.pivot.add(root);
  }

  update(dt: number): void {
    if (!this.active || !this.renderer) return;
    this.spin += dt * 0.35;
    this.pivot.rotation.y = Math.sin(this.spin) * 0.35 + this.spin * 0.15;
    if (this.mixer) this.mixer.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
}

export function skinName(id: BirdSkinId): string {
  return BIRD_SKINS.find((s) => s.id === id)?.name ?? BIRD_SKINS[0].name;
}
