# Ships the codex-ui branch: local checks, commit, push. The PR, CI and merge
# into main are then done on GitHub. Run from the ai-sales folder:
#   powershell -ExecutionPolicy Bypass -File .\ship-to-main.ps1
$ErrorActionPreference = "Stop"

function Step($name, [scriptblock]$cmd) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $name (exit $LASTEXITCODE). Nothing was committed or pushed." -ForegroundColor Red; exit 1 }
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "codex-ui") { Write-Host "Expected branch codex-ui, found '$branch'. Stopping." -ForegroundColor Red; exit 1 }

# Keep the local backups and this script out of the commit (local-only ignore, not committed).
$exclude = ".git/info/exclude"
foreach ($pattern in @("style-backup-*.zip", "ship-to-main.ps1")) {
  if (-not (Select-String -Path $exclude -SimpleMatch $pattern -Quiet)) { Add-Content $exclude $pattern }
}

Step "Lint"      { npm run lint }
Step "Typecheck" { npm run typecheck }
Step "Build"     { npm run build }

Write-Host "`n=== Files to commit ===" -ForegroundColor Cyan
git add -A
git status --short

$message = @"
Customer dashboard Wave redesign: production sizing, sidebar collapse, colour and dark mode

- Wave re-skin of /dashboard (lime/olive, rounded) with production's font
  families, sizes, weights, padding and page gutters; Conversations inbox
  edge-to-edge like production
- Sidebar collapse/expand (same storage key as production)
- Human labels for lead sources and placeholder names, channel-icon avatars,
  Interest column hidden when empty
- Lime reserved for active/selected states; success green; amber attention KPI;
  funnel-ordered pipeline colours
- Dark mode restored (production ThemeToggle, dark default), AA contrast in both themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WTobm9zXPDszZPgQyVLLv2
"@

Step "Commit" { git commit -m $message }
Step "Push"   { git push -u origin codex-ui }

Write-Host "`nDone. codex-ui is pushed. Tell Claude to continue with the PR, CI and merge." -ForegroundColor Green
