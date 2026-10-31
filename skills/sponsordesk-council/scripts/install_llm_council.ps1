# Installs karpathy/llm-council on Windows for SponsorDesk.
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File install_llm_council.ps1
# Needs: Git for Windows, Python 3.10+, Node 18+ (only for the web UI), an OpenRouter API key.
$ErrorActionPreference = "Stop"
$Dest = if ($env:LLM_COUNCIL_DIR) { $env:LLM_COUNCIL_DIR } else { Join-Path $HOME "tools\llm-council" }

if (-not (Test-Path (Join-Path $Dest ".git"))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
    git clone https://github.com/karpathy/llm-council $Dest
} else {
    git -C $Dest pull --ff-only
}
Set-Location $Dest

if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv sync
} else {
    Write-Host "Installing uv..."
    python -m pip install --user uv
    python -m uv sync      # works even when uv.exe is not on PATH yet
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location frontend; npm install; Pop-Location
} else {
    Write-Host "npm not found: skipping web UI. Headless council_cli.py still works."
}

if (-not (Test-Path ".env")) {
    $key = if ($env:OPENROUTER_API_KEY) { $env:OPENROUTER_API_KEY } else { "sk-or-v1-PASTE_YOURS" }
    "OPENROUTER_API_KEY=$key" | Out-File -Encoding ascii .env
    Write-Host "Wrote $Dest\.env  -> put your OpenRouter key in it."
}

[Environment]::SetEnvironmentVariable("LLM_COUNCIL_DIR", $Dest, "User")
Write-Host ""
Write-Host "Installed at $Dest (LLM_COUNCIL_DIR set for your user)."
Write-Host "Web UI: two terminals in $Dest ->  uv run python -m backend.main   and   cd frontend; npm run dev   then open http://localhost:5173"
Write-Host "Headless: cd $Dest; uv run python <pack>\sponsordesk-council\scripts\council_cli.py --in brief.md --out verdict"
Write-Host "Choose models in backend\config.py (current ids at openrouter.ai/models)."
