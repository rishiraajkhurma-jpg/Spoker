---
name: sponsordesk-council
description: Second-opinion review panel for SponsorDesk using karpathy/llm-council (several LLMs answer independently, rank each other anonymously, a chairman synthesizes). Use for high-stakes calls only - final P1 prospect ranking, a company-specific pitch deck before a meeting, an MOU before it goes out, any below-floor or exclusivity exception, and the renewal offer. Not for routine emails or follow-ups.
---

# SponsorDesk Council

A single model grading its own work is the weakest check in the system. The council gives the manager a panel: 3-4 different models (via OpenRouter) answer the same structured question, review each other's answers without knowing who wrote what, and a chairman model writes the verdict. SponsorDesk uses it as the "separate reviewer that has not seen the work being produced".

Source: https://github.com/karpathy/llm-council (provided as-is by the author, unsupported, no license file; we do not redistribute it, we install it from GitHub).

## Install (once per machine)

```bash
bash sponsordesk-council/scripts/install_llm_council.sh      # macOS/Linux: clones to ~/tools/llm-council, uv sync, npm install
powershell -ExecutionPolicy Bypass -File sponsordesk-council\scripts\install_llm_council.ps1   # Windows
# put your key in ~/tools/llm-council/.env : OPENROUTER_API_KEY=sk-or-v1-...
export LLM_COUNCIL_DIR=~/tools/llm-council
```

Pick models in `~/tools/llm-council/backend/config.py`. Recommended SponsorDesk council: one model from each of 3-4 different labs (diversity is the point), chairman = the strongest reasoning model you can afford. Check current ids at openrouter.ai/models; ids in the upstream file go stale. Each council run costs roughly 8-9 model calls; budget accordingly and never run it in a loop over hundreds of companies.

Two ways to use it:
- **Web UI** (`./start.sh`, http://localhost:5173): the manager pastes a council brief and reads the tabs. Good for live discussion.
- **Headless** (agents): write the brief to a file, then
  `cd "$LLM_COUNCIL_DIR" && uv run python <pack>/sponsordesk-council/scripts/council_cli.py --in brief.md --out runs/<company>-<kind>`
  Read `<out>.md` (verdict, ranking, dissent) and keep `<out>.json` as the audit record.

If the council is not installed or the key is missing, say so once, then fall back to a **self-review**: spawn a fresh subagent with only the brief (not the drafting history) and the same rubric. Never skip the review silently.

## When each agent calls the council

| Trigger | Agent | Question to the council |
|---|---|---|
| Final P1 list (top 10-20) before outreach starts | A1 | "Given the event profile and these 20 scored companies with evidence, which 10 should we approach first and which scores are wrong?" |
| Deck + talk track ready, meeting within 72h | A4 | "Score this deck against the rubric. What will the sponsor's marketing head object to? What slide should be cut?" |
| MOU draft ready | A6 | "Does this MOU match the agreed deal? List any clause that is one-sided, vague, or promises something the event cannot deliver." |
| Below-floor counter, exclusivity ask, custom deliverable | A5 | "Should we accept, counter or decline? Propose a counter that trades value, not price." |
| Renewal offer | A7 | "Given delivery results, what renewal tier and price should we propose?" |

## How to write a council brief

The council sees nothing but the brief. Make it self-contained and short enough to read in two minutes:

```markdown
# Council brief: <kind> for <company> (<event>)
## Decision needed
One sentence. Example: "Approve, edit or reject this MOU before it is emailed to Acme."
## Context
- Event: name, dates, audience facts (only sourced numbers)
- Deal so far: tier, cash, in-kind, deliverables, deadlines, what the sponsor said in meetings
- Our floor: INR X. Our policies: ...
## The artifact
<deck outline / MOU text / scored table / counter-offer>
## Rubric (answer every item)
1. ...
2. ...
## Output format
- Verdict: APPROVE / APPROVE WITH EDITS / REJECT
- Top 3 issues, each with the exact fix
- Anything that is factually unsupported by the context
```

Strip personal data the council does not need (personal phone numbers, home addresses). Company names and business titles are fine.

## Using the verdict

- The council advises; the manager decides. Put the verdict summary in the exceptions inbox item next to the agent's own recommendation, with the dissent if the models disagreed.
- If the council says REJECT and the agent disagrees, show both and let the manager choose. Do not auto-apply edits to anything that goes to a sponsor.
- Log every run in the `log` table: `action=council`, detail = output path and verdict.
