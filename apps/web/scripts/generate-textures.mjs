import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "textures",
);
mkdirSync(outDir, { recursive: true });

function hash2(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 5; i++) {
    v += amp * noise(x * freq, y * freq, seed + i * 19);
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(pixels, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const dest = y * (w * 4 + 1);
    raw[dest] = 0;
    for (let x = 0; x < w * 4; x++) {
      raw[dest + 1 + x] = pixels[y * w * 4 + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillDirt(px) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x / 48, y / 48, 3);
      const peb = fbm(x / 12, y / 12, 11);
      const i = (y * SIZE + x) * 4;
      px[i] = clampByte(118 + n * 50 + peb * 18);
      px[i + 1] = clampByte(86 + n * 36 + peb * 10);
      px[i + 2] = clampByte(54 + n * 22);
      px[i + 3] = 255;
    }
  }
}

function fillRock(px) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x / 36, y / 64, 7);
      const crack = Math.abs(fbm(x / 10, y / 80, 21) - 0.5) * 2;
      const i = (y * SIZE + x) * 4;
      px[i] = clampByte(132 + n * 48 - crack * 28);
      px[i + 1] = clampByte(96 + n * 32 - crack * 18);
      px[i + 2] = clampByte(72 + n * 22 - crack * 12);
      px[i + 3] = 255;
    }
  }
}

function fillGrass(px) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x / 28, y / 28, 5);
      const blade = noise(x / 3, y / 8, 17);
      const i = (y * SIZE + x) * 4;
      px[i] = clampByte(72 + n * 40 + blade * 18);
      px[i + 1] = clampByte(92 + n * 48 + blade * 22);
      px[i + 2] = clampByte(42 + n * 20);
      px[i + 3] = 255;
    }
  }
}

const dirt = new Uint8Array(SIZE * SIZE * 4);
const rock = new Uint8Array(SIZE * SIZE * 4);
const grass = new Uint8Array(SIZE * SIZE * 4);
fillDirt(dirt);
fillRock(rock);
fillGrass(grass);

writeFileSync(join(outDir, "dirt.png"), encodePng(dirt, SIZE, SIZE));
writeFileSync(join(outDir, "rock.png"), encodePng(rock, SIZE, SIZE));
writeFileSync(join(outDir, "grass.png"), encodePng(grass, SIZE, SIZE));
console.log("Wrote textures to", outDir);
