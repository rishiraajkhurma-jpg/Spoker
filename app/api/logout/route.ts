export async function POST() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": "sd_auth=; Path=/; Max-Age=0" } });
}
