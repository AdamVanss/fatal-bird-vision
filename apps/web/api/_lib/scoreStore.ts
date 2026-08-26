import { trimRuns, type PlayerRun } from "./playerRun";

const KEY = "fatal-bird-vision:players";

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function scoresConfigured(): boolean {
  return redisEnv() !== null;
}

async function redisCommand(
  env: { url: string; token: string },
  command: unknown[],
): Promise<unknown> {
  const res = await fetch(env.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Score store failed (${res.status})`);
  }
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

export async function readPlayers(): Promise<PlayerRun[]> {
  const env = redisEnv();
  if (!env) return [];
  const raw = await redisCommand(env, ["GET", KEY]);
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as { players?: PlayerRun[] };
    return Array.isArray(parsed.players) ? parsed.players : [];
  } catch {
    return [];
  }
}

export async function appendPlayer(run: PlayerRun): Promise<PlayerRun> {
  const env = redisEnv();
  if (!env) {
    throw new Error("Score store is not configured");
  }
  const players = trimRuns([...(await readPlayers()), run]);
  await redisCommand(env, ["SET", KEY, JSON.stringify({ players })]);
  return run;
}
