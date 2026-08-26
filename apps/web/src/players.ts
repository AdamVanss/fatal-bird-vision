import type { PlayerRun } from "./types";

export async function fetchPlayers(): Promise<PlayerRun[]> {
  try {
    const res = await fetch("/api/players");
    if (!res.ok) return [];
    const data = (await res.json()) as { players?: PlayerRun[] };
    return Array.isArray(data.players) ? data.players : [];
  } catch {
    return [];
  }
}

export async function savePlayerRun(
  run: Omit<PlayerRun, "at">,
): Promise<boolean> {
  try {
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function topScores(players: PlayerRun[], limit = 12): PlayerRun[] {
  return [...players].sort((a, b) => b.score - a.score).slice(0, limit);
}
