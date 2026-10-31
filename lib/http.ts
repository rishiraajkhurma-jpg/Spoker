import { requireUser, Role, User } from "./auth";

/** Route wrapper: auth (role), same-origin check for writes, JSON errors. */
export function wrap(fn: (req: Request, user: User) => Promise<any>, opts: { role?: Role } = {}) {
  return async (req: Request) => {
    const r = await requireUser(req, opts.role || "readonly");
    if (r.res) return r.res;
    try {
      const out = await fn(req, r.user);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e: any) {
      console.error(e);
      return Response.json({ error: e?.message || String(e) }, { status: 400 });
    }
  };
}
