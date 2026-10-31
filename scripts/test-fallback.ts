import { claude } from "../lib/claude";
process.env.ANTHROPIC_API_KEY = "a"; process.env.GEMINI_API_KEY = "g"; delete process.env.SD_MODEL; delete process.env.CRUSTDATA_API_KEY;
const calls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
  if (url.includes("anthropic")) { calls.push("anthropic"); return { ok: false, status: 400, text: async () => '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}' }; }
  calls.push("gemini:" + url.split("/models/")[1].split(":")[0]);
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "<json>{\"ok\":true}</json>" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://x.com", title: "x" } }] } }] }) };
};
(async () => {
  const r = await claude({ system: "s", prompt: "p", web: 3 });
  const ok = r.text.includes('"ok":true') && calls.join(",") === "anthropic,gemini:gemini-3.8-flash" && r.sources[0]?.url === "https://x.com";
  delete process.env.GEMINI_API_KEY;
  let msg = ""; try { await claude({ system: "s", prompt: "p" }); } catch (e: any) { msg = e.message; }
  const ok2 = msg.startsWith("Claude: the account has no credit");
  console.log(ok && ok2 ? "FALLBACK PASS" : "FAIL " + JSON.stringify({ calls, msg }));
  process.exit(ok && ok2 ? 0 : 1);
})();
