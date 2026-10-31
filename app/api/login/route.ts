import { login, clientIp } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const r = await login(String(email || ""), String(password || ""), clientIp(req));
  if (!r.cookie) return Response.json({ error: r.error }, { status: r.status || 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": r.cookie } });
}
