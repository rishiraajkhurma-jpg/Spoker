import { guard } from "./auth";

export function wrap(fn: (req: Request) => Promise<any>, opts: { auth?: boolean } = { auth: true }) {
  return async (req: Request) => {
    if (opts.auth !== false) { const g = await guard(req); if (g) return g; }
    try {
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e: any) {
      console.error(e);
      return Response.json({ error: e?.message || String(e) }, { status: 400 });
    }
  };
}
