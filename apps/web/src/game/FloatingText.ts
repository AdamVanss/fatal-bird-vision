import * as THREE from "three";
import {
  XP_FLOAT_LIFETIME,
  XP_TEXT_COLOR,
  XP_TEXT_OUTLINE_COLOR,
  XP_TEXT_RISE,
  XP_TEXT_WORLD_WIDTH,
} from "../constants";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 256;
const SPRITE_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT;
const FONT = "500 96px 'JetBrains Mono', ui-monospace, monospace";
const OUTLINE_BLUR_SOFT = 18;
const OUTLINE_BLUR_CRISP = 8;
const OUTLINE_WIDTH = 10;

const POP_IN_END = 0.2;
const SETTLE_END = 0.35;
const FADE_DURATION = 0.5;

/** World-space XP popup. Keep calling update() until it returns false, then dispose(). */
export class FloatingText {
  private readonly sprite: THREE.Sprite;
  private readonly material: THREE.SpriteMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly anchor: THREE.Object3D;
  private elapsed = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    text: string,
    anchor: THREE.Object3D,
    fillColor = XP_TEXT_COLOR,
  ) {
    this.anchor = anchor;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d")!;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = XP_TEXT_OUTLINE_COLOR;
    ctx.shadowBlur = OUTLINE_BLUR_SOFT;
    ctx.lineWidth = OUTLINE_WIDTH;
    ctx.strokeStyle = XP_TEXT_OUTLINE_COLOR;
    ctx.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.shadowBlur = OUTLINE_BLUR_CRISP;
    ctx.fillStyle = fillColor;
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 10;
    scene.add(this.sprite);
  }

  update(dt: number): boolean {
    if (this.disposed) return false;
    this.elapsed += dt;

    const age = this.elapsed;
    const life = XP_FLOAT_LIFETIME;
    if (age >= life) return false;

    let scale: number;
    if (age < POP_IN_END) {
      const popInFrac = age / POP_IN_END;
      scale = 1.2 * (1 - Math.pow(1 - popInFrac, 3));
    } else if (age < SETTLE_END) {
      scale = 1.2 - 0.2 * ((age - POP_IN_END) / (SETTLE_END - POP_IN_END));
    } else {
      scale = 1.0;
    }

    const fadeStart = life - FADE_DURATION;
    this.material.opacity =
      age < fadeStart ? 1 : 1 - (age - fadeStart) / FADE_DURATION;

    const riseFrac = age / life;
    this.sprite.position.set(
      this.anchor.position.x,
      this.anchor.position.y + XP_TEXT_RISE * riseFrac,
      this.anchor.position.z,
    );
    const width = XP_TEXT_WORLD_WIDTH * scale;
    this.sprite.scale.set(width, width / SPRITE_ASPECT, 1);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
