import { appendPlayer, readPlayers, scoresConfigured } from "./_lib/scoreStore";
import { sanitizeRun, type PlayerRun } from "./_lib/playerRun";

export const config = { runtime: "edge" };

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") {
    try {
      return json({ players: await readPlayers() });
    } catch (err) {
      console.error(err);
      return json({ error: "Could not load scores" }, 500);
    }
  }

  if (req.method === "POST") {
    if (!scoresConfigured()) {
      return json(
        {
          error:
            "Scores need a free Vercel KV store. Create one in the project Storage tab, then redeploy.",
        },
        503,
      );
    }
    try {
      const parsed = (await req.json()) as Partial<PlayerRun>;
      const run = sanitizeRun(parsed);
      if (!run) return json({ error: "Invalid player run" }, 400);
      await appendPlayer(run);
      return json(run, 201);
    } catch (err) {
      console.error(err);
      return json({ error: "Could not save score" }, 400);
    }
  }

  return new Response(null, { status: 405 });
}
