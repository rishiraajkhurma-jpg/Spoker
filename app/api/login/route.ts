import { loginCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  const c = await loginCookie(String(password || ""));
  if (!c) return Response.json({ error: "Wrong password" }, { status: 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": c } });
}
