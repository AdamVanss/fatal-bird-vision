export const config = { runtime: "edge" };

/** Flight clips stay on the local kiosk. Production hosting skips the file. */
export default function handler(req: Request): Response {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return new Response(JSON.stringify({ skipped: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
