import * as THREE from "three";
import { CANYON } from "../constants";
import type { ModelKit } from "./ModelKit";

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function canvasTex(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAsphalt(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a3d42";
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.85));
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "#e8c84a";
  ctx.lineWidth = 7;
  ctx.setLineDash([34, 26]);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#f0f0ec";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(26, size);
  ctx.moveTo(size - 26, 0);
  ctx.lineTo(size - 26, size);
  ctx.stroke();
  return canvasTex(canvas, 1, 36);
}

function makeSidewalk(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c4c0b6";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#a8a49a";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.strokeRect(i * 32 + 1, j * 32 + 1, 30, 30);
    }
  }
  return canvasTex(canvas, 2, 80);
}

function makeLot(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#4a4e54";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#5a5e64";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) ctx.strokeRect(i * 32, 0, 32, size);
  return canvasTex(canvas, 4, 40);
}

function makeCrosswalk(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#f4f4ee";
  for (let i = 0; i < 8; i++) ctx.fillRect(i * 16 + 2, 8, 10, 112);
  const tex = canvasTex(canvas, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeAd(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const palettes = [
    ["#5fd832", "#050505", "#f4f4f0"],
    ["#1a6cff", "#0a1220", "#ffe14a"],
    ["#ff4d2e", "#160808", "#ffffff"],
    ["#7a3cff", "#12081c", "#9ef0ff"],
    ["#f0a020", "#1a1208", "#fff6e0"],
  ];
  const pal = palettes[seed % palettes.length];
  ctx.fillStyle = pal[1];
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = pal[0];
  ctx.fillRect(18, 18, w - 36, 92);
  ctx.fillStyle = pal[2];
  ctx.fillRect(18, 128, w - 36, 18);
  ctx.fillStyle = pal[0];
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.85 - i * 0.12;
    ctx.fillRect(18, 168 + i * 48, (w - 36) * (0.92 - i * 0.14), 28);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal[2];
  ctx.fillRect(18, h - 48, 72, 28);
  const tex = canvasTex(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

type Facade = {
  albedo: THREE.CanvasTexture;
  emit: THREE.CanvasTexture;
  metalness: number;
  roughness: number;
};

function makeFacade(seed: number, kind: "glass" | "masonry" | "brick"): Facade {
  const w = 256;
  const h = 512;
  const albedoC = document.createElement("canvas");
  const emitC = document.createElement("canvas");
  albedoC.width = emitC.width = w;
  albedoC.height = emitC.height = h;
  const a = albedoC.getContext("2d")!;
  const e = emitC.getContext("2d")!;
  const skins = {
    glass: ["#6e8eaa", "#8aa8c4"],
    masonry: ["#9aa0a8", "#868c94"],
    brick: ["#b56a52", "#9a5844"],
  };
  const pal = skins[kind];
  a.fillStyle = pal[0];
  a.fillRect(0, 0, w, h);
  e.fillStyle = "#000000";
  e.fillRect(0, 0, w, h);

  if (kind === "brick") {
    a.fillStyle = pal[1];
    for (let y = 0; y < h; y += 10) {
      a.fillRect(0, y, w, 2);
    }
  }

  const cols = kind === "glass" ? 7 : 5 + (seed % 2);
  const rows = kind === "glass" ? 18 : 11 + (seed % 4);
  const marginX = kind === "glass" ? 6 : 16;
  const marginY = kind === "glass" ? 8 : 22;
  const gapX = kind === "glass" ? 3 : 9;
  const gapY = kind === "glass" ? 4 : 11;
  const cellW = (w - marginX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (h - marginY * 2 - gapY * (rows - 1)) / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = marginX + col * (cellW + gapX);
      const y = marginY + row * (cellH + gapY);
      const lit = hash(seed + col, row + 3) > 0.34;
      if (kind === "glass") {
        a.fillStyle = lit ? "#c8e4f8" : "#8eb8d8";
      } else {
        a.fillStyle = lit ? "#d8e8f4" : "#1c2834";
      }
      a.fillRect(x, y, cellW, cellH);
      if (lit) {
        e.fillStyle = hash(seed, row * 7 + col) > 0.55 ? "#ffc56a" : "#9ec8ff";
        e.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }
    }
  }
  a.fillStyle = pal[1];
  a.fillRect(0, 0, w, kind === "glass" ? 10 : 18);

  const albedo = canvasTex(albedoC);
  const emit = canvasTex(emitC);
  emit.colorSpace = THREE.NoColorSpace;
  return {
    albedo,
    emit,
    metalness: kind === "glass" ? 0.72 : 0.08,
    roughness: kind === "glass" ? 0.16 : 0.68,
  };
}

const GEO = {
  box: (() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  wheel: new THREE.CylinderGeometry(0.33, 0.33, 0.26, 12),
  hub: new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10),
  pole: new THREE.CylinderGeometry(0.07, 0.1, 8.1, 8),
  base: new THREE.CylinderGeometry(0.32, 0.38, 0.22, 10),
  arm: new THREE.BoxGeometry(2.15, 0.1, 0.12),
  head: new THREE.BoxGeometry(0.82, 0.18, 0.34),
  glass: new THREE.BoxGeometry(0.72, 0.07, 0.28),
  trunk: new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6),
  crown: new THREE.ConeGeometry(0.72, 1.55, 7),
  column: new THREE.CylinderGeometry(0.48, 0.52, 3.4, 14),
  cap: new THREE.CylinderGeometry(0.56, 0.5, 0.18, 14),
};

GEO.wheel.rotateZ(Math.PI / 2);
GEO.hub.rotateZ(Math.PI / 2);

const MAT = {
  rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92, metalness: 0.05 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xc8c8cc, roughness: 0.35, metalness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8ec4e8,
    roughness: 0.12,
    metalness: 0.78,
    envMapIntensity: 1.2,
  }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.38, metalness: 0.72 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.42, metalness: 0.65 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3aaa48, roughness: 0.72 }),
  planter: new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.78 }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xfff0c0,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  }),
  taillight: new THREE.MeshStandardMaterial({
    color: 0xff3030,
    emissive: 0xff2020,
    emissiveIntensity: 0.4,
    roughness: 0.35,
  }),
};

function tintedCar(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0.55,
    envMapIntensity: 0.9,
  });
}

function makeCar(color: number, kind: number): THREE.Group {
  const g = new THREE.Group();
  const paint = tintedCar(color);
  const tall = kind > 0.66;
  const hatch = kind > 0.33 && kind <= 0.66;
  const bodyH = tall ? 0.62 : 0.48;
  const cabinH = tall ? 0.78 : 0.58;
  const len = hatch ? 3.6 : 4.15;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.78, bodyH, len), paint);
  body.position.y = 0.38 + bodyH * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, cabinH, hatch ? 1.7 : 1.95),
    MAT.glass,
  );
  cabin.position.set(0, 0.38 + bodyH + cabinH * 0.42, hatch ? -0.05 : -0.18);
  cabin.castShadow = true;
  g.add(cabin);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.28), paint);
  bumperF.position.set(0, 0.4, len * 0.5 - 0.02);
  const bumperR = bumperF.clone();
  bumperR.position.z = -len * 0.5 + 0.02;
  g.add(bumperF, bumperR);

  for (const sx of [-1, 1]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), MAT.headlight);
    light.position.set(sx * 0.58, 0.48, len * 0.5 + 0.02);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.08), MAT.taillight);
    tail.position.set(sx * 0.58, 0.5, -len * 0.5 - 0.02);
    g.add(light, tail);
  }

  const wheelZ = hatch ? 1.15 : 1.35;
  for (const sx of [-0.82, 0.82]) {
    for (const sz of [-wheelZ, wheelZ]) {
      const tire = new THREE.Mesh(GEO.wheel, MAT.rubber);
      tire.position.set(sx, 0.33, sz);
      tire.castShadow = true;
      const hub = new THREE.Mesh(GEO.hub, MAT.hub);
      hub.position.copy(tire.position);
      g.add(tire, hub);
    }
  }
  return g;
}

function makeLamp(side: number, lampMat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(GEO.base, MAT.steel);
  base.position.y = 0.11;
  const pole = new THREE.Mesh(GEO.pole, MAT.steel);
  pole.position.y = 4.15;
  pole.castShadow = true;
  const arm = new THREE.Mesh(GEO.arm, MAT.steel);
  arm.position.set(-side * 0.95, 8.12, 0);
  const head = new THREE.Mesh(GEO.head, MAT.darkSteel);
  head.position.set(-side * 1.95, 8.05, 0);
  const glass = new THREE.Mesh(GEO.glass, lampMat);
  glass.position.set(-side * 1.95, 7.93, 0);
  g.add(base, pole, arm, head, glass);
  return g;
}

function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.95), MAT.planter);
  pot.position.y = 0.32;
  pot.castShadow = true;
  const trunk = new THREE.Mesh(GEO.trunk, MAT.bark);
  trunk.position.y = 0.86;
  const crown = new THREE.Mesh(GEO.crown, MAT.leaf);
  crown.position.y = 1.85;
  crown.castShadow = true;
  g.add(pot, trunk, crown);
  return g;
}

function makeMorris(seed: number): THREE.Group {
  const g = new THREE.Group();
  const poster = new THREE.MeshStandardMaterial({
    map: makeAd(seed),
    roughness: 0.55,
    metalness: 0.08,
  });
  const col = new THREE.Mesh(GEO.column, poster);
  col.position.y = 1.85;
  col.castShadow = true;
  const cap = new THREE.Mesh(GEO.cap, MAT.steel);
  cap.position.y = 3.62;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.16, 12), MAT.steel);
  foot.position.y = 0.2;
  g.add(foot, col, cap);
  return g;
}

function makeBillboard(seed: number, side: number): THREE.Group {
  const g = new THREE.Group();
  const postMat = MAT.steel;
  for (const pz of [-1.15, 1.15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.4, 8), postMat);
    post.position.set(0, 2.7, pz);
    post.castShadow = true;
    g.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 3.6), MAT.darkSteel);
  frame.position.y = 4.15;
  const poster = makeAd(seed + 3);
  const ad = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 2.4),
    new THREE.MeshStandardMaterial({
      map: poster,
      roughness: 0.48,
      metalness: 0.06,
      emissive: 0xffffff,
      emissiveMap: poster,
      emissiveIntensity: 0,
    }),
  );
  ad.position.set(-side * 0.1, 4.15, 0);
  ad.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(frame, ad);
  return g;
}

function makeKiosk(seed: number, side: number): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), MAT.steel);
  post.position.y = 1.4;
  post.castShadow = true;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.7, 1.15),
    new THREE.MeshStandardMaterial({
      map: makeAd(seed + 7),
      roughness: 0.5,
      metalness: 0.05,
    }),
  );
  panel.position.set(-side * 0.08, 1.7, 0);
  g.add(post, panel);
  return g;
}

export interface CityLights {
  nightMats: THREE.MeshStandardMaterial[];
  lampMats: THREE.MeshStandardMaterial[];
}

function placeKenneyCity(root: THREE.Group, kit: ModelKit): void {
  const n = kit.buildings.length;
  for (let i = 0; i < 34; i++) {
    for (const side of [-1, 1]) {
      const src = kit.buildings[(i * 2 + (side > 0 ? 1 : 0)) % n];
      const b = kit.clone(src);
      const size = b.userData.size as THREE.Vector3;
      const z = 16 + i * 21 + (hash(i, side + 2) - 0.5) * 2.2;
      const targetH = 32 + hash(i, 6) * 38;
      const s = targetH / Math.max(0.01, size.y);
      b.scale.setScalar(s);
      const depth = Math.max(size.x, size.z) * s;
      b.position.set(side * (16.2 + depth * 0.45), 0, z);
      b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(b);
    }
  }
  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      const src = kit.buildings[i % n];
      const b = kit.clone(src);
      const size = b.userData.size as THREE.Vector3;
      const z = 28 + i * 48;
      const s = (48 + hash(i, 21) * 36) / Math.max(0.01, size.y);
      b.scale.setScalar(s);
      b.position.set(side * (48 + hash(i, 25) * 14), 0, z);
      b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(b);
    }
  }
}

/** Dense downtown corridor the bird flies down. */
export function populateCity(root: THREE.Group, kit?: ModelKit): CityLights {
  const nightMats: THREE.MeshStandardMaterial[] = [];
  const lampMats: THREE.MeshStandardMaterial[] = [];
  const length = CANYON.length + 80;
  const midZ = length * 0.42;

  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(22, length),
    new THREE.MeshStandardMaterial({
      map: makeAsphalt(),
      roughness: 0.68,
      metalness: 0.1,
      color: 0xffffff,
    }),
  );
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0.01, midZ);
  street.receiveShadow = true;
  root.add(street);

  const lotMat = new THREE.MeshStandardMaterial({
    map: makeLot(),
    roughness: 0.88,
    color: 0xffffff,
  });
  for (const side of [-1, 1]) {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(90, length), lotMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(side * 56, -0.02, midZ);
    lot.receiveShadow = true;
    root.add(lot);
  }

  const walkMat = new THREE.MeshStandardMaterial({
    map: makeSidewalk(),
    roughness: 0.86,
    color: 0xffffff,
  });
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.24, length), walkMat);
    walk.position.set(side * 13.3, 0.13, midZ);
    walk.receiveShadow = true;
    root.add(walk);
  }

  const stripeMat = new THREE.MeshStandardMaterial({
    map: makeCrosswalk(),
    transparent: true,
    roughness: 0.85,
    metalness: 0,
  });
  for (let i = 0; i < 12; i++) {
    const z = 40 + i * 58;
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.2), stripeMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.04, z);
    root.add(walk);
  }

  if (kit?.buildings.length) {
    placeKenneyCity(root, kit);
  } else {
    const glass = [0, 1, 2].map((i) => makeFacade(i + 31, "glass"));
    const masonry = [0, 1, 2].map((i) => makeFacade(i + 11, "masonry"));
    const brick = [0, 1].map((i) => makeFacade(i + 21, "brick"));

    for (let i = 0; i < 38; i++) {
      for (const side of [-1, 1]) {
        const z = 14 + i * 19 + (hash(i, side + 2) - 0.5) * 3.4;
        const w = 8.5 + hash(i, 4) * 9;
        const d = 10 + hash(i, 5) * 10;
        const podiumH = 8 + hash(i, 7) * 7;
        const towerH = 18 + hash(i, 6) * 58;
        const roll = hash(i, 8);
        const face = roll > 0.55 ? glass[(i + (side > 0 ? 1 : 0)) % glass.length]
          : roll > 0.28 ? masonry[(i + (side > 0 ? 1 : 0)) % masonry.length]
          : brick[i % brick.length];
        const x = side * (15.7 + w * 0.5);

        const mat = new THREE.MeshStandardMaterial({
          map: face.albedo,
          emissiveMap: face.emit,
          emissive: new THREE.Color(0xffe6b0),
          emissiveIntensity: 0,
          roughness: face.roughness,
          metalness: face.metalness,
          envMapIntensity: face.metalness > 0.4 ? 1.15 : 0.45,
        });
        nightMats.push(mat);

        const podium = new THREE.Mesh(GEO.box, mat);
        podium.scale.set(w * 1.08, podiumH, d * 1.08);
        podium.position.set(x, 0, z);
        podium.castShadow = true;
        podium.receiveShadow = true;
        root.add(podium);

        const tower = new THREE.Mesh(GEO.box, mat);
        tower.scale.set(w * 0.78, towerH, d * 0.78);
        tower.position.set(x + side * 0.4, podiumH, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        root.add(tower);
      }
    }
  }

  const carColors = [0xc43a2a, 0xf2f0ea, 0x2a5aa8, 0x1c1c22, 0xe8b84a, 0x2e8a5a];
  for (let i = 0; i < 26; i++) {
    const side = hash(i, 40) > 0.5 ? 1 : -1;
    const z = 22 + i * 27 + hash(i, 41) * 8;
    const car = makeCar(carColors[i % carColors.length], hash(i, 42));
    car.position.set(side * 7.35, 0, z);
    car.rotation.y = side > 0 ? 0 : Math.PI;
    root.add(car);
  }

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d2,
    emissive: 0xffe6a8,
    emissiveIntensity: 0.15,
    roughness: 0.28,
    metalness: 0.2,
  });
  lampMats.push(lampMat);
  for (let i = 0; i < 28; i++) {
    const z = 22 + i * 26;
    for (const side of [-1, 1]) {
      const lamp = makeLamp(side, lampMat);
      lamp.position.set(side * 11.05, 0, z);
      root.add(lamp);
    }
  }

  for (let i = 0; i < 22; i++) {
    const z = 18 + i * 32;
    for (const side of [-1, 1]) {
      const tree = makeTree();
      tree.position.set(side * 12.55, 0, z + (side > 0 ? 8 : 0));
      root.add(tree);
    }
  }

  for (let i = 0; i < 10; i++) {
    const z = 36 + i * 68;
    const side = hash(i, 60) > 0.5 ? 1 : -1;
    const board = makeBillboard(i + 4, side);
    board.position.set(side * 14.6, 0, z);
    const ad = board.children.find(
      (c) => c instanceof THREE.Mesh && (c.material as THREE.MeshStandardMaterial).emissiveMap,
    ) as THREE.Mesh | undefined;
    if (ad) nightMats.push(ad.material as THREE.MeshStandardMaterial);
    root.add(board);
  }

  for (let i = 0; i < 12; i++) {
    const z = 48 + i * 54;
    const side = i % 2 === 0 ? -1 : 1;
    const col = makeMorris(i + 9);
    col.position.set(side * 12.35, 0, z);
    root.add(col);
  }

  for (let i = 0; i < 16; i++) {
    const z = 30 + i * 42;
    const side = hash(i, 70) > 0.5 ? 1 : -1;
    const kiosk = makeKiosk(i + 2, side);
    kiosk.position.set(side * 11.55, 0, z + 10);
    root.add(kiosk);
  }

  return { nightMats, lampMats };
}
