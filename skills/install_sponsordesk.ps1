# One-shot Windows installer for the SponsorDesk skill pack.
# Run from the unzipped sponsordesk-skills folder:
#   powershell -ExecutionPolicy Bypass -File .\install_sponsordesk.ps1
# 1) copies every SponsorDesk skill and the imported MIT skills into %USERPROFILE%\.claude\skills (Claude Code)
# 2) builds one upload-ready zip per skill in .\upload-zips (for claude.ai / desktop: Settings > Capabilities > Skills)
# 3) initialises the pipeline database
# 4) installs karpathy/llm-council (needs Git, Python 3.10+, optional Node)
param([switch]$SkipCouncil)
$ErrorActionPreference = "Stop"
$Pack = Split-Path -Parent $MyInvocation.MyCommand.Path
$Skills = Join-Path $HOME ".claude\skills"
$Zips = Join-Path $Pack "upload-zips"
New-Item -ItemType Directory -Force -Path $Skills, $Zips | Out-Null

$dirs = @(Get-ChildItem $Pack -Directory | Where-Object { $_.Name -like "sponsordesk-*" })
$dirs += Get-ChildItem (Join-Path $Pack "third_party") -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory }
foreach ($d in $dirs) {
    if (-not (Test-Path (Join-Path $d.FullName "SKILL.md"))) { continue }
    $target = Join-Path $Skills $d.Name
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    Copy-Item -Recurse $d.FullName $target
    $zip = Join-Path $Zips ($d.Name + ".zip")
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path $d.FullName -DestinationPath $zip
    Write-Host ("installed " + $d.Name)
}

$db = Join-Path $Pack "sponsordesk.db"
$env:SPONSORDESK_DB = $db
$py = (Get-Command python -ErrorAction SilentlyContinue)
if ($py) {
    $pdb = Join-Path $Pack "sponsordesk-orchestrator\scripts\pipeline_db.py"
    python $pdb init
    [Environment]::SetEnvironmentVariable("SPONSORDESK_DB", $db, "User")
    $cfg = (python $pdb config get) -join "`n"
    if ($cfg -notmatch '"approvers"') {
        $pin = Read-Host "Postal PIN code for email signatures (e.g. 400076)"
        if ($pin) { python $pdb config set postal $pin }
        $names = Read-Host "Names allowed to approve emails, comma separated (e.g. Rishiraaj)"
        if ($names) { python $pdb config set approvers $names }
    }
} else {
    Write-Host "Python not found: skipped database init. Install Python 3.10+ and rerun."
}

if (-not $SkipCouncil) {
    & (Join-Path $Pack "sponsordesk-council\scripts\install_llm_council.ps1")
}

Write-Host ""
Write-Host "Done. Skills copied to $Skills"
Write-Host "Upload zips for claude.ai are in $Zips"
