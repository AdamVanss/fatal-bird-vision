import * as THREE from "three";
import { CANYON } from "../constants";
import { populateCity } from "./Cityscape";
import { ModelKit } from "./ModelKit";

export type MapId = "canyon" | "city";

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number): number {
  return (
    noise(x, z) * 0.5 +
    noise(x * 2.03, z * 2.03) * 0.25 +
    noise(x * 4.07, z * 4.07) * 0.125
  );
}

/** World-space canyon surface. Valley is low and wide; cliffs rise outside it. */
export function canyonHeight(x: number, z: number): number {
  const meander = Math.sin(z * 0.011) * 3.2 + Math.sin(z * 0.027) * 1.1;
  const localX = x - meander;
  const valleyHalf = 11.5 + Math.sin(z * 0.019) * 1.8 + fbm(z * 0.04, 2) * 1.2;
  const floor =
    fbm(x * 0.08, z * 0.05) * 1.15 + Math.sin(z * 0.04) * 0.35;

  const edge = Math.abs(localX) - valleyHalf;
  if (edge <= 0) {
    return floor;
  }

  const t = THREE.MathUtils.clamp(edge / 14, 0, 1);
  const rise = t * t * (28 + fbm(x * 0.06, z * 0.04) * 8);
  const ledges = Math.abs(Math.sin(rise * 0.42 + z * 0.03)) * 1.4 * t;
  const crags = (fbm(x * 0.22, z * 0.09) - 0.5) * 4.5 * t;
  return floor + rise + ledges + crags;
}

function sandstoneColor(x: number, y: number, z: number): THREE.Color {
  const slopeBoost = THREE.MathUtils.clamp((y - 2) / 26, 0, 1);
  const band = 0.5 + 0.5 * Math.sin(y * 0.55 + z * 0.02);
  const color = new THREE.Color();
  color.setRGB(
    THREE.MathUtils.lerp(0.62, 0.78, band) - slopeBoost * 0.08,
    THREE.MathUtils.lerp(0.42, 0.52, band) - slopeBoost * 0.04,
    THREE.MathUtils.lerp(0.28, 0.34, band),
  );
  const n = fbm(x * 0.15, z * 0.15);
  color.offsetHSL(0, 0, (n - 0.5) * 0.08);
  if (y < 2.4) {
    color.lerp(new THREE.Color(0x7a9a48), 0.42);
  } else if (y > 22 && fbm(x * 0.2, z * 0.2) > 0.58) {
    color.lerp(new THREE.Color(0x6e7a52), 0.28);
  }
  return color;
}

async function loadTiledTexture(
  url: string,
  repeatX: number,
  repeatY: number,
): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeCloudTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 7; i++) {
    const cx = 70 + Math.random() * 116;
    const cy = 90 + Math.random() * 76;
    const r = 28 + Math.random() * 48;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, "rgba(255, 250, 242, 0.55)");
    g.addColorStop(0.5, "rgba(255, 244, 228, 0.22)");
    g.addColorStop(1, "rgba(255, 244, 228, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrassCard(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    const x = 14 + (i / 17) * 100 + (Math.random() - 0.5) * 8;
    const h = 48 + Math.random() * 70;
    const lean = (Math.random() - 0.5) * 18;
    ctx.beginPath();
    ctx.moveTo(x - 2.2, size);
    ctx.quadraticCurveTo(x + lean * 0.4, size - h * 0.55, x + lean, size - h);
    ctx.quadraticCurveTo(x + 2.4 + lean * 0.2, size - h * 0.5, x + 2.4, size);
    ctx.closePath();
    const shade = 70 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade * 0.55}, ${shade + 20}, ${shade * 0.28}, 0.92)`;
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function splatWeights(x: number, y: number, z: number): THREE.Vector3 {
  const dx = 0.55;
  const slope = Math.abs(canyonHeight(x + dx, z) - canyonHeight(x - dx, z)) / (dx * 2);
  let grass = y < 3.2 && slope < 0.55 ? THREE.MathUtils.smoothstep(0.55, 0.12, slope) : 0;
  grass *= THREE.MathUtils.smoothstep(4.2, 1.2, y);
  let rock = THREE.MathUtils.clamp(slope * 0.55 + Math.max(0, y - 7) / 22, 0, 1);
  rock *= 1 - grass * 0.85;
  let dirt = Math.max(0.08, 1 - grass - rock);
  const sum = grass + dirt + rock;
  return new THREE.Vector3(grass / sum, dirt / sum, rock / sum);
}

function makeSkyEnv(): THREE.CubeTexture {
  const mk = (top: string, bot: string) => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return c;
  };
  const sky = "#7eb4e8";
  const hor = "#d4e4f4";
  const gnd = "#6a7068";
  const cube = new THREE.CubeTexture([
    mk(sky, hor),
    mk(sky, hor),
    mk(sky, sky),
    mk(gnd, gnd),
    mk(sky, hor),
    mk(sky, hor),
  ]);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

export class World {
  readonly scene = new THREE.Scene();
  mapId: MapId = "canyon";
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly bounce: THREE.DirectionalLight;
  private readonly key: THREE.DirectionalLight;
  private readonly mapRoot = new THREE.Group();
  private sky: THREE.Mesh | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private readonly clouds: THREE.Mesh[] = [];
  private nightMats: THREE.MeshStandardMaterial[] = [];
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private dirt: THREE.Texture | null = null;
  private rock: THREE.Texture | null = null;
  private grass: THREE.Texture | null = null;
  private env: THREE.CubeTexture | null = null;
  private readonly kit = new ModelKit();
  private clock = 0;
  private night = 0;
  private nightTarget = 0;

  constructor() {
    this.scene.background = new THREE.Color(0xefd4ae);
    this.scene.fog = new THREE.Fog(0xefd0a6, 55, 430);
    this.scene.add(this.mapRoot);

    this.hemi = new THREE.HemisphereLight(0xfff3dc, 0x7a5538, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0c8, 2.35);
    this.sun.position.set(28, 72, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.radius = 2.5;
    this.sun.shadow.camera.near = 8;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.camera.left = -20;
    this.sun.shadow.camera.right = 20;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -14;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x8eb4d8, 0.42);
    this.fill.position.set(-48, 22, -14);
    this.scene.add(this.fill);

    this.bounce = new THREE.DirectionalLight(0xc48a58, 0.18);
    this.bounce.position.set(0, -8, 20);
    this.scene.add(this.bounce);

    this.key = new THREE.DirectionalLight(0xfff4e8, 0.22);
    this.key.castShadow = false;
    this.scene.add(this.key);
    this.scene.add(this.key.target);
  }

  get nightAmount(): number {
    return this.night;
  }

  /** Keep the sun shadow volume and sky around the bird as it flies the canyon. */
  updateSun(birdZ: number, camPos: THREE.Vector3): void {
    this.sun.position.set(18, 86, birdZ + 4);
    this.sun.target.position.set(0, 6, birdZ + 18);
    this.sun.target.updateMatrixWorld();
    this.key.position.copy(camPos);
    this.key.target.position.set(0, 8, birdZ + 5);
    this.key.target.updateMatrixWorld();
    this.sky?.position.set(0, 0, birdZ);
  }

  height(x: number, z: number): number {
    return this.mapId === "city" ? 0 : canyonHeight(x, z);
  }

  setNightTarget(on: boolean): void {
    this.nightTarget = on ? 1 : 0;
  }

  resetDay(): void {
    this.night = 0;
    this.nightTarget = 0;
    this.applyNight(0);
  }

  update(dt: number, birdZ: number, camPos: THREE.Vector3): void {
    this.clock += dt;
    this.updateSun(birdZ, camPos);
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 0.65);
    this.applyNight(this.night);
    for (const cloud of this.clouds) {
      cloud.position.x += Math.sin(this.clock * 0.04 + cloud.userData.phase) * 0.012;
      cloud.lookAt(camPos.x, cloud.position.y, camPos.z);
    }
  }

  async loadTextures(): Promise<void> {
    await Promise.all([
      loadTiledTexture("/textures/dirt.png", 1, 1),
      loadTiledTexture("/textures/rock.png", 1, 1),
      loadTiledTexture("/textures/grass.png", 1, 1),
      this.kit.load(),
    ]).then(([dirt, rock, grass]) => {
      this.dirt = dirt;
      this.rock = rock;
      this.grass = grass;
    });
    this.addSky();
    this.env = makeSkyEnv();
    this.scene.environment = this.env;
    this.setMap("canyon");
  }

  setMap(id: MapId): void {
    this.mapId = id;
    this.clearMap();
    this.resetDay();
    if (id === "city") {
      const lights = populateCity(this.mapRoot, this.kit);
      this.nightMats = lights.nightMats;
      this.lampMats = lights.lampMats;
    } else if (this.dirt && this.rock && this.grass) {
      this.buildCanyon(this.dirt, this.rock, this.grass);
      this.addGrassTufts();
      this.addTalus(this.rock);
      this.addRimShrubs();
      this.addCacti();
      this.addDistantMesas(this.rock);
    }
    this.addClouds();
  }

  private clearMap(): void {
    while (this.mapRoot.children.length) {
      this.mapRoot.remove(this.mapRoot.children[0]);
    }
    this.clouds.length = 0;
    this.nightMats = [];
    this.lampMats = [];
  }

  private applyNight(t: number): void {
    const fog = this.scene.fog as THREE.Fog;
    const city = this.mapId === "city";
    const dayFog = city ? 0x9ec6e8 : 0xefd0a6;
    const nightFog = city ? 0x0b1020 : 0x141018;
    fog.color.setHex(dayFog).lerp(new THREE.Color(nightFog), t);
    fog.near = THREE.MathUtils.lerp(city ? 70 : 55, 48, t);
    fog.far = THREE.MathUtils.lerp(city ? 560 : 430, 340, t);
    this.scene.background = fog.color.clone();

    this.sun.intensity = THREE.MathUtils.lerp(city ? 2.75 : 2.35, 0.7, t);
    this.sun.color.setHex(0xfff0c8).lerp(new THREE.Color(0xb8d0f0), t);
    this.hemi.intensity = THREE.MathUtils.lerp(city ? 1.28 : 1.05, 0.92, t);
    this.hemi.color.setHex(city ? 0xe8f2ff : 0xfff3dc).lerp(new THREE.Color(0x7a9cc8), t);
    this.hemi.groundColor.setHex(city ? 0x7a8078 : 0x7a5538).lerp(new THREE.Color(0x2a2838), t);
    this.fill.intensity = THREE.MathUtils.lerp(city ? 0.55 : 0.42, 0.55, t);
    this.fill.color.setHex(0x8eb4d8).lerp(new THREE.Color(0xa8c4ee), t);
    this.bounce.intensity = THREE.MathUtils.lerp(city ? 0.28 : 0.18, 0.2, t);
    this.key.intensity = THREE.MathUtils.lerp(0.22, 1.7, t);
    this.key.color.setHex(0xfff4e8).lerp(new THREE.Color(0xd4e4ff), t);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(city ? 1.05 : 0.55, 0.35, t);

    if (this.skyMat) {
      const dayTop = this.mapId === "city" ? 0x4a90d8 : 0x6ea4d2;
      const nightTop = 0x08101f;
      const dayMid = this.mapId === "city" ? 0x8ebce8 : 0xb7d0e8;
      const nightMid = 0x152038;
      const dayHor = this.mapId === "city" ? 0xd8e4f0 : 0xf3c58a;
      const nightHor = this.mapId === "city" ? 0x1a1430 : 0x1c1420;
      this.skyMat.uniforms.top.value.setHex(dayTop).lerp(new THREE.Color(nightTop), t);
      this.skyMat.uniforms.mid.value.setHex(dayMid).lerp(new THREE.Color(nightMid), t);
      this.skyMat.uniforms.horizon.value.setHex(dayHor).lerp(new THREE.Color(nightHor), t);
      this.skyMat.uniforms.sunAmt.value = THREE.MathUtils.lerp(1, 0.12, t);
    }

    const windowGlow = t * t * 1.55;
    for (const mat of this.nightMats) mat.emissiveIntensity = windowGlow;
    for (const mat of this.lampMats) mat.emissiveIntensity = THREE.MathUtils.lerp(0.2, 2.2, t);
    for (const cloud of this.clouds) {
      const mat = cloud.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(0.92, 0.18, t);
    }
  }

  private buildCanyon(
    dirt: THREE.Texture,
    rock: THREE.Texture,
    grass: THREE.Texture,
  ): void {
    const width = 96;
    const length = CANYON.length + 50;
    const geo = new THREE.PlaneGeometry(width, length, 120, 220);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const splat = new Float32Array(pos.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const zLocal = pos.getZ(i);
      const z = zLocal + length * 0.42;
      const y = canyonHeight(x, z);
      pos.setY(i, y);
      uv.setXY(i, x / 12, z / 12);
      color.copy(sandstoneColor(x, y, z));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      const w = splatWeights(x, y, z);
      splat[i * 3] = w.x;
      splat[i * 3 + 1] = w.y;
      splat[i * 3 + 2] = w.z;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("splat", new THREE.BufferAttribute(splat, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: dirt,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      color: 0xffe4c4,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.grassMap = { value: grass };
      shader.uniforms.rockMap = { value: rock };
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        attribute vec3 splat;
        varying vec3 vSplat;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vSplat = splat;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D grassMap;
        uniform sampler2D rockMap;
        varying vec3 vSplat;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        vec4 dirtTex = texture2D(map, vMapUv);
        vec4 grassTex = texture2D(grassMap, vMapUv * 1.35);
        vec4 rockTex = texture2D(rockMap, vMapUv * 0.62);
        vec3 w = vSplat / max(0.001, dot(vSplat, vec3(1.0)));
        vec4 sampledDiffuseColor = grassTex * w.x + dirtTex * w.y + rockTex * w.z;
        diffuseColor *= sampledDiffuseColor;
        `,
      );
    };
    mat.customProgramCacheKey = () => "canyon-splat-v1";

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, length * 0.42);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.mapRoot.add(mesh);
  }

  private addTalus(rock: THREE.Texture): void {
    const geos = [
      new THREE.DodecahedronGeometry(1.1, 0),
      new THREE.IcosahedronGeometry(1.05, 0),
      new THREE.TetrahedronGeometry(1.2, 0),
    ];
    const mat = new THREE.MeshStandardMaterial({
      map: rock,
      color: 0xc4a078,
      roughness: 0.96,
    });
    for (let i = 0; i < 72; i++) {
      const z = 8 + (i / 72) * (CANYON.length - 16) + (hash(i, 3) - 0.5) * 8;
      const side = i % 2 === 0 ? 1 : -1;
      const meander = Math.sin(z * 0.011) * 3.2;
      const x = meander + side * (10.2 + hash(i, 9) * 4.2);
      const mesh = new THREE.Mesh(geos[i % geos.length], mat);
      mesh.position.set(x, canyonHeight(x, z) + 0.35, z);
      mesh.rotation.set(hash(i, 1) * 6, hash(i, 2) * 6, hash(i, 4) * 6);
      mesh.scale.set(
        0.5 + hash(i, 5) * 1.5,
        0.4 + hash(i, 6) * 1.1,
        0.5 + hash(i, 8) * 1.3,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mapRoot.add(mesh);
    }
  }

  private addGrassTufts(): void {
    const geo = new THREE.PlaneGeometry(1.7, 1.15);
    geo.translate(0, 0.55, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: makeGrassCard(),
      color: 0xd4e080,
      roughness: 0.95,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dummy = new THREE.Object3D();
    const count = 160;
    const a = new THREE.InstancedMesh(geo, mat, count);
    const b = new THREE.InstancedMesh(geo, mat, count);
    a.receiveShadow = true;
    b.receiveShadow = true;
    let n = 0;
    for (let i = 0; i < 220 && n < count; i++) {
      const z = 12 + hash(i, 41) * (CANYON.length - 30);
      const meander = Math.sin(z * 0.011) * 3.2;
      const x = meander + (hash(i, 42) - 0.5) * 18;
      const y = canyonHeight(x, z);
      if (y > 3.6) continue;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, hash(i, 43) * Math.PI, (hash(i, 44) - 0.5) * 0.18);
      dummy.scale.setScalar(0.7 + hash(i, 45) * 1.1);
      dummy.updateMatrix();
      a.setMatrixAt(n, dummy.matrix);
      dummy.rotation.y += Math.PI / 2;
      dummy.updateMatrix();
      b.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
    a.count = n;
    b.count = n;
    this.mapRoot.add(a, b);
  }

  private addRimShrubs(): void {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3424,
      roughness: 1,
    });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x6d7548, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x8a7a48, roughness: 0.94 }),
    ];
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.15, 1.15, 5);
    const leafGeo = new THREE.SphereGeometry(0.85, 6, 4);
    leafGeo.scale(1.45, 0.42, 1.15);

    for (let i = 0; i < 56; i++) {
      const z = 18 + hash(i, 11) * (CANYON.length - 40);
      const side = i % 2 === 0 ? 1 : -1;
      const meander = Math.sin(z * 0.011) * 3.2;
      const x = meander + side * (21 + hash(i, 13) * 7);
      const y = canyonHeight(x, z);
      const shrub = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      const leaf = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
      trunk.position.y = 0.55;
      leaf.position.y = 1.32;
      leaf.rotation.y = hash(i, 19) * 6;
      leaf.castShadow = true;
      shrub.add(trunk, leaf);
      if (hash(i, 20) > 0.45) {
        const leaf2 = leaf.clone();
        leaf2.scale.setScalar(0.62);
        leaf2.position.set((hash(i, 21) - 0.5) * 0.9, 1.05, (hash(i, 22) - 0.5) * 0.7);
        shrub.add(leaf2);
      }
      shrub.position.set(x, y, z);
      shrub.scale.setScalar(0.65 + hash(i, 17) * 1.05);
      this.mapRoot.add(shrub);
    }
  }

  private addCacti(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4d6a3c,
      roughness: 0.78,
    });
    const rib = new THREE.MeshStandardMaterial({
      color: 0x3d5630,
      roughness: 0.82,
    });
    for (let i = 0; i < 22; i++) {
      const z = 40 + hash(i, 50) * (CANYON.length - 80);
      const side = i % 2 === 0 ? 1 : -1;
      const meander = Math.sin(z * 0.011) * 3.2;
      const x = meander + side * (16 + hash(i, 51) * 8);
      const y = canyonHeight(x, z);
      const h = 1.8 + hash(i, 52) * 2.4;
      const cactus = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, h, 8), mat);
      trunk.position.y = h * 0.5;
      trunk.castShadow = true;
      cactus.add(trunk);
      const armH = 0.7 + hash(i, 53) * 0.8;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, armH, 6), rib);
      arm.position.set(side * 0.32, h * 0.55, 0);
      arm.rotation.z = side * 0.9;
      arm.castShadow = true;
      cactus.add(arm);
      cactus.position.set(x, y, z);
      cactus.rotation.y = hash(i, 54) * 6;
      this.mapRoot.add(cactus);
    }
  }

  private addDistantMesas(rock: THREE.Texture): void {
    const mat = new THREE.MeshStandardMaterial({
      map: rock,
      color: 0xb88962,
      roughness: 0.97,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x8a9a62,
      roughness: 1,
    });
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const z = 40 + i * 44;
      const h = 16 + hash(i, 21) * 18;
      const rTop = 6 + hash(i, 8) * 5;
      const rBot = rTop + 4 + hash(i, 9) * 5;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8), mat);
      const x = side * (46 + hash(i, 6) * 10);
      mesh.position.set(x, 3 + h * 0.38, z);
      mesh.rotation.y = (hash(i, 7) - 0.5) * 0.5;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop * 0.92, rTop * 1.02, 0.7, 8),
        capMat,
      );
      cap.position.set(x, mesh.position.y + h * 0.5, z);
      this.mapRoot.add(mesh, cap);
    }
  }

  private addSky(): void {
    const geo = new THREE.SphereGeometry(520, 40, 22);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x6ea4d2) },
        mid: { value: new THREE.Color(0xb7d0e8) },
        horizon: { value: new THREE.Color(0xf3c58a) },
        sunDir: { value: new THREE.Vector3(0.38, 0.78, 0.18).normalize() },
        sunAmt: { value: 1 },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform float sunAmt;
        void main() {
          vec3 dir = normalize(vPos);
          float h = dir.y;
          vec3 col = mix(horizon, mid, smoothstep(-0.08, 0.18, h));
          col = mix(col, top, smoothstep(0.12, 0.72, h));
          float sun = pow(max(0.0, dot(dir, sunDir)), 220.0);
          float glow = pow(max(0.0, dot(dir, sunDir)), 8.0);
          col += vec3(1.0, 0.88, 0.55) * sun * 1.6 * sunAmt;
          col += vec3(1.0, 0.72, 0.32) * glow * 0.22 * sunAmt;
          col += vec3(0.75, 0.82, 1.0) * sun * 0.9 * (1.0 - sunAmt);
          float night = 1.0 - sunAmt;
          float star = step(0.996, fract(sin(dot(dir.xy * 80.0, vec2(12.9898, 78.233))) * 43758.5453));
          col += vec3(0.85, 0.9, 1.0) * star * night * 0.85;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMat = mat;
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  private addClouds(): void {
    const tex = makeCloudTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: true,
      opacity: 0.92,
    });
    for (let i = 0; i < 28; i++) {
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(22 + hash(i, 34) * 16, 12 + hash(i, 35) * 8),
        mat,
      );
      cloud.position.set(
        (hash(i, 30) - 0.5) * 110,
        36 + hash(i, 31) * 18,
        24 + hash(i, 32) * CANYON.length,
      );
      cloud.userData.phase = hash(i, 36) * 12;
      this.clouds.push(cloud);
      this.mapRoot.add(cloud);
    }
  }
}
