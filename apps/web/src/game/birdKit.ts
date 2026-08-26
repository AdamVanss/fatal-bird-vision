import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { BIRD_SKINS, type BirdSkin, type BirdSkinId } from "../constants";

const cache = new Map<string, Promise<GLTF>>();

export function birdSkinById(id: BirdSkinId): BirdSkin {
  return BIRD_SKINS.find((s) => s.id === id) ?? BIRD_SKINS[0];
}

export function loadBirdGltf(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url);
    cache.set(url, pending);
  }
  return pending;
}

export function instantiateBird(
  gltf: GLTF,
  tint: BirdSkin["tint"],
  targetSize: number,
  grounded = false,
  fitAxis: "x" | "y" = "y",
): { root: THREE.Group; mixer: THREE.AnimationMixer | null } {
  const model = cloneSkinned(gltf.scene);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = false;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      const copy = mat.clone();
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.vertexColors = true;
        if (copy.emissive.getHex() === 0) copy.emissive.setHex(0x24180c);
        copy.emissiveIntensity = 0;
        applyTextureTint(copy, tint);
      }
      return copy;
    });
    child.material = next.length === 1 ? next[0] : next;
  });

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const axis = fitAxis === "x" ? size.x : size.y;
  model.scale.multiplyScalar(targetSize / Math.max(axis, 0.01));
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  if (grounded) {
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
  } else {
    model.position.sub(fitted.getCenter(new THREE.Vector3()));
  }

  const root = new THREE.Group();
  root.add(model);

  let mixer: THREE.AnimationMixer | null = null;
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
    action.timeScale = 1.05;
  }
  return { root, mixer };
}

function applyTextureTint(
  mat: THREE.MeshStandardMaterial,
  tint: BirdSkin["tint"],
): void {
  if (!tint) return;
  if (tint.color != null) mat.color.setHex(tint.color);
  const hue = tint.hue ?? 0;
  const sat = tint.sat ?? -1;
  const lit = tint.lit ?? -1;
  if (hue === 0 && sat < 0 && lit < 0) {
    mat.needsUpdate = true;
    return;
  }
  mat.customProgramCacheKey = () => `bird-tint:${hue}:${sat}:${lit}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBirdHue = { value: hue };
    shader.uniforms.uBirdSat = { value: sat };
    shader.uniforms.uBirdLit = { value: lit };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uBirdHue;
uniform float uBirdSat;
uniform float uBirdLit;
vec3 birdRgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 birdHsvToRgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 birdTintAlbedo(vec3 color) {
  vec3 hsv = birdRgbToHsv(max(color, vec3(0.0)));
  hsv.x = fract(hsv.x + uBirdHue);
  if (uBirdSat >= 0.0) hsv.y = mix(hsv.y, uBirdSat, 0.94);
  if (uBirdLit >= 0.0) hsv.z = mix(hsv.z, uBirdLit, 0.88);
  return birdHsvToRgb(hsv);
}
`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb = birdTintAlbedo(diffuseColor.rgb);
`,
      );
  };
  mat.needsUpdate = true;
}
