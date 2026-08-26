import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, ViteDevServer } from "vite";
import { DIFFICULTIES, sanitizeRun, type PlayerRun } from "./api/_lib/playerRun.ts";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "players.json");
const VIDEO_DIR = path.join(DATA_DIR, "videos");
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function readStore(): { players: PlayerRun[] } {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as { players?: PlayerRun[] };
    return { players: Array.isArray(parsed.players) ? parsed.players : [] };
  } catch {
    return { players: [] };
  }
}

function writeStore(store: { players: PlayerRun[] }): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readBuffer(req: Connect.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk) => {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > maxBytes) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "pilot";
}

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function attach(server: ViteDevServer): void {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";

    if (url === "/api/videos") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      try {
        const origin = `http://127.0.0.1${req.url ?? ""}`;
        const params = new URL(origin).searchParams;
        const name = slugName(params.get("name") ?? "");
        const difficulty = String(params.get("difficulty") ?? "normal");
        const safeDiff = DIFFICULTIES.has(difficulty) ? difficulty : "normal";
        const type = String(req.headers["content-type"] ?? "video/webm");
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const body = await readBuffer(req, MAX_VIDEO_BYTES);
        if (body.length < 800) {
          sendJson(res, 400, { error: "Empty clip" });
          return;
        }
        fs.mkdirSync(VIDEO_DIR, { recursive: true });
        const file = `${fileStamp()}_${name}_${safeDiff}.${ext}`;
        fs.writeFileSync(path.join(VIDEO_DIR, file), body);
        sendJson(res, 201, { file });
      } catch (err) {
        const tooLarge = err instanceof Error && err.message === "too large";
        sendJson(res, tooLarge ? 413 : 400, {
          error: tooLarge ? "Clip too large" : "Could not save clip",
        });
      }
      return;
    }

    if (url !== "/api/players") {
      next();
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, readStore());
      return;
    }

    if (req.method === "POST") {
      try {
        const parsed = JSON.parse(await readBody(req)) as Partial<PlayerRun>;
        const run = sanitizeRun(parsed);
        if (!run) {
          sendJson(res, 400, { error: "Invalid player run" });
          return;
        }
        const store = readStore();
        store.players.push(run);
        writeStore(store);
        sendJson(res, 201, run);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    res.statusCode = 405;
    res.end();
  });
}

/** Local JSON leaderboard for the museum kiosk. */
export function playersApi(): Plugin {
  return {
    name: "players-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
