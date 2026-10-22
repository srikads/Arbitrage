<#
.SYNOPSIS
  Run the watcher on a Windows laptop against a local clone, with a bigger local model.
.EXAMPLE
  $env:ARB_PASSPHRASE = "..."; .\scripts\laptop-watch.ps1 -Mode deep
.EXAMPLE
  .\scripts\laptop-watch.ps1 -Mode digest -DryRun
#>
param(
  [ValidateSet("auto", "light", "deep", "digest")] [string]$Mode = "auto",
  [string]$Model = $(if ($env:ARB_MODEL) { $env:ARB_MODEL } else { "qwen2.5:7b" }),
  [string]$OllamaUrl = $(if ($env:OLLAMA_URL) { $env:OLLAMA_URL } else { "http://127.0.0.1:11434" }),
  [int]$LlmBudgetSec = 1200,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $PSScriptRoot
Set-Location $RepoDir

if (-not $env:ARB_PASSPHRASE) {
  $secure = Read-Host "Passphrase" -AsSecureString
  $env:ARB_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

git pull --rebase --quiet
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

python -c "import arbitrage_watcher" 2>$null
if ($LASTEXITCODE -ne 0) { python -m pip install --quiet -e .\watcher }

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  try { Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 3 | Out-Null }
  catch { Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden; Start-Sleep 3 }
  $have = (ollama list) -match ("^" + [regex]::Escape($Model) + "\s")
  if (-not $have) { ollama pull $Model }
} else {
  Write-Warning "ollama not found: running with the lexicon fallback"
}

$runArgs = @("-m", "arbitrage_watcher", "run", "--repo-dir", $RepoDir, "--mode", $Mode,
             "--ollama-url", $OllamaUrl, "--model", $Model, "--llm-budget", $LlmBudgetSec)
if ($DryRun) { $runArgs += "--dry-run" }
python @runArgs
if ($LASTEXITCODE -ne 0) { throw "watcher failed" }

if (-not $DryRun) {
  git add data/*.enc
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git -c user.name="arbitrage-watcher" -c user.email="watcher@users.noreply.github.com" commit --quiet -m "chore: update feed"
    foreach ($i in 1..3) {
      git pull --rebase --quiet
      if ($LASTEXITCODE -eq 0) { git push --quiet; if ($LASTEXITCODE -eq 0) { exit 0 } }
      Start-Sleep ($i * 5)
    }
    throw "push failed"
  }
}
