// Minimal MCP client (Streamable HTTP, JSON-RPC) for providers without a native MCP connector (Gemini).
export type McpTool = { name: string; description?: string; inputSchema?: any };

export class McpClient {
  private url: string;
  private token: string;
  private session = "";
  private id = 0;
  constructor(url: string, token: string) { this.url = url; this.token = token; }

  private async rpc(method: string, params?: any, notify = false): Promise<any> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.token}`,
      "mcp-protocol-version": "2025-06-18",
    };
    if (this.session) headers["mcp-session-id"] = this.session;
    const body: any = { jsonrpc: "2.0", method };
    if (params !== undefined) body.params = params;
    if (!notify) body.id = ++this.id;
    const res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.session = sid;
    if (notify) return null;
    if (!res.ok) throw new Error(`MCP ${method} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    let msg: any = null;
    if (ct.includes("text/event-stream")) {
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        try { const j = JSON.parse(line.slice(5).trim()); if (j.id === body.id) msg = j; } catch { /* skip */ }
      }
    } else {
      msg = JSON.parse(text);
    }
    if (!msg) throw new Error(`MCP ${method}: empty response`);
    if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message || JSON.stringify(msg.error)}`);
    return msg.result;
  }

  async init() {
    await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sponsordesk", version: "1.0.0" } });
    await this.rpc("notifications/initialized", undefined, true);
  }
  async tools(): Promise<McpTool[]> {
    const out: McpTool[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const r = await this.rpc("tools/list", cursor ? { cursor } : {});
      out.push(...(r.tools || []));
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    return out;
  }
  async call(name: string, args: any): Promise<string> {
    const r = await this.rpc("tools/call", { name, arguments: args || {} });
    const parts = (r.content || []).map((c: any) => (c.type === "text" ? c.text : JSON.stringify(c)));
    if (r.structuredContent && !parts.length) parts.push(JSON.stringify(r.structuredContent));
    return (r.isError ? "ERROR: " : "") + parts.join("\n");
  }
}
