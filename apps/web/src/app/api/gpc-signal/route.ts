// Echoes whether the visitor's browser sent Sec-GPC on this request.
// Powers the live browser check on /gpc-checker. Never cached.
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const header = request.headers.get("sec-gpc")?.trim() === "1";
  return Response.json({ header }, { headers: { "Cache-Control": "no-store", Vary: "Sec-GPC" } });
}
