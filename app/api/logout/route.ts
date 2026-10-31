import { logout } from "@/lib/auth";

export async function POST(req: Request) {
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": await logout(req) } });
}
