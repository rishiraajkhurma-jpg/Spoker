#!/usr/bin/env bash
# Installs karpathy/llm-council on this machine for SponsorDesk.
# The repo has no license file, so SponsorDesk does not ship its code; this script clones it from GitHub.
# Needs: git, uv (https://docs.astral.sh/uv/), Node 18+ (only for the optional web UI), an OpenRouter API key.
set -euo pipefail

DEST="${LLM_COUNCIL_DIR:-$HOME/tools/llm-council}"

if [ ! -d "$DEST/.git" ]; then
  mkdir -p "$(dirname "$DEST")"
  git clone https://github.com/karpathy/llm-council "$DEST"
else
  git -C "$DEST" pull --ff-only || true
fi

cd "$DEST"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Installing with pip..."
  python3 -m pip install --user uv || pip install uv
fi
uv sync

if command -v npm >/dev/null 2>&1; then
  (cd frontend && npm install)
else
  echo "npm not found: skipping web UI. Headless council (council_cli.py) still works."
fi

if [ ! -f .env ]; then
  printf 'OPENROUTER_API_KEY=%s\n' "${OPENROUTER_API_KEY:-sk-or-v1-PASTE_YOURS}" > .env
  echo "Wrote $DEST/.env  -> put your OpenRouter key in it."
fi

echo
echo "Installed at: $DEST"
echo "Add to your shell profile:  export LLM_COUNCIL_DIR=\"$DEST\""
echo "Web UI:   cd \"$DEST\" && ./start.sh   (then open http://localhost:5173)"
echo "Headless: python3 <sponsordesk>/sponsordesk-council/scripts/council_cli.py --in question.md --out verdict"
echo "Edit $DEST/backend/config.py to choose COUNCIL_MODELS and CHAIRMAN_MODEL (check current ids on openrouter.ai/models)."
