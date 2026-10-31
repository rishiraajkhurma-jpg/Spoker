#!/usr/bin/env python3
"""Headless wrapper around karpathy/llm-council for SponsorDesk agents.

Runs the council's 3 stages (independent answers -> anonymous peer ranking -> chairman synthesis)
on a question file and writes <out>.json (everything) and <out>.md (readable verdict).

Usage:
  LLM_COUNCIL_DIR=~/tools/llm-council python3 council_cli.py --in question.md --out runs/acme-score
Run it with the council's own environment so its dependencies resolve:
  cd "$LLM_COUNCIL_DIR" && uv run python /path/to/council_cli.py --in q.md --out v
"""
import argparse, asyncio, json, os, sys


def load_council():
    root = os.path.expanduser(os.environ.get("LLM_COUNCIL_DIR", "~/tools/llm-council"))
    if not os.path.isdir(os.path.join(root, "backend")):
        sys.exit(f"llm-council not found at {root}. Run install_llm_council.sh or set LLM_COUNCIL_DIR.")
    os.chdir(root)                     # so its .env and data dir resolve
    sys.path.insert(0, root)
    from backend.council import run_full_council  # noqa: E402
    from backend import config                    # noqa: E402
    if not config.OPENROUTER_API_KEY or "PASTE" in config.OPENROUTER_API_KEY:
        sys.exit("OPENROUTER_API_KEY missing in llm-council/.env")
    return run_full_council, config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    inp = os.path.abspath(a.inp); out = os.path.abspath(a.out)
    question = open(inp, encoding="utf-8").read()
    run_full_council, config = load_council()
    s1, s2, s3, meta = asyncio.run(run_full_council(question))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    payload = {"question": question, "council": config.COUNCIL_MODELS, "chairman": config.CHAIRMAN_MODEL,
               "stage1": s1, "stage2": s2, "final": s3, "meta": meta}
    with open(out + ".json", "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    lines = ["# Council verdict", "", f"Chairman: {s3.get('model')}", "", s3.get("response", ""), "", "## Aggregate ranking"]
    for r in meta.get("aggregate_rankings", []) or []:
        lines.append(f"- {r.get('model')}: avg rank {r.get('average_rank')} ({r.get('rankings_count')} votes)")
    lines += ["", "## Dissent (stage 1 answers, first 600 chars each)"]
    for r in s1:
        lines += [f"### {r.get('model')}", (r.get("response") or "")[:600], ""]
    with open(out + ".md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(out + ".md")
    if s3.get("model") == "error":
        sys.exit(2)


if __name__ == "__main__":
    main()
