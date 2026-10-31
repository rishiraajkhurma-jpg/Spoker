import { guard } from "@/lib/auth";
import { exchange } from "@/lib/gmail";
import { log } from "@/lib/ledger";

export async function GET(req: Request) {
  const g = await guard(req); if (g) return g;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${url.origin}/?gmail=error`, 302);
  try {
    const email = await exchange(code, url.origin);
    await log("manager", null, "gmail_connected", email);
    return Response.redirect(`${url.origin}/?gmail=connected`, 302);
  } catch (e: any) {
    return Response.redirect(`${url.origin}/?gmail=${encodeURIComponent(e.message.slice(0, 120))}`, 302);
  }
}
