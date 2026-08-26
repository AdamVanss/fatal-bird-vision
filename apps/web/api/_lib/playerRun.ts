export const DIFFICULTIES = new Set(["easy", "normal", "hard", "impossible"]);

export interface PlayerRun {
  name: string;
  difficulty: string;
  multiplier: number;
  score: number;
  ringsCollected: number;
  ringsTotal: number;
  elapsedSeconds: number;
  at: string;
}

export const MAX_STORED_RUNS = 500;

export function sanitizeRun(input: Partial<PlayerRun>): PlayerRun | null {
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  const difficulty = String(input.difficulty ?? "");
  if (!name || !DIFFICULTIES.has(difficulty)) return null;

  const multiplier = Number(input.multiplier);
  const score = Number(input.score);
  const ringsCollected = Number(input.ringsCollected);
  const ringsTotal = Number(input.ringsTotal);
  const elapsedSeconds = Number(input.elapsedSeconds);
  if (
    ![multiplier, score, ringsCollected, ringsTotal, elapsedSeconds].every(
      Number.isFinite,
    )
  ) {
    return null;
  }

  return {
    name,
    difficulty,
    multiplier: Math.max(0, multiplier),
    score: Math.max(0, Math.round(score)),
    ringsCollected: Math.max(0, Math.round(ringsCollected)),
    ringsTotal: Math.max(0, Math.round(ringsTotal)),
    elapsedSeconds: Math.max(0, elapsedSeconds),
    at: new Date().toISOString(),
  };
}

export function trimRuns(players: PlayerRun[]): PlayerRun[] {
  if (players.length <= MAX_STORED_RUNS) return players;
  return [...players].sort((a, b) => b.score - a.score).slice(0, MAX_STORED_RUNS);
}
