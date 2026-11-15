<#
.SYNOPSIS
  Builds Simple Markdown as a portable Windows executable.

.DESCRIPTION
  1. Installs dependencies (if node_modules is missing)
  2. Runs unit tests and type checks (skip with -SkipChecks)
  3. Compiles the app (electron-vite)
  4. Packages it with electron-builder:
       release\SimpleMarkdown-<version>-portable.exe   (single file, no install)
       release\SimpleMarkdown-<version>-x64.zip        (unzip-and-run folder, with -Zip)

  Only Node.js is required. Nothing is installed system-wide.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1
  powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1 -Zip -SkipChecks
#>
param(
  [switch]$SkipChecks,
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# Some hosts (e.g. VS Code) set this; it would make Electron behave as plain Node.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Run($cmd, $argList) {
  & $cmd @argList
  if ($LASTEXITCODE -ne 0) { throw "'$cmd $($argList -join ' ')' failed with exit code $LASTEXITCODE" }
}

Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js was not found on PATH. Install Node.js 20+ and try again.' }
$nodeVersion = (& node --version)
Write-Host "Node $nodeVersion"
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 20) { throw 'Node.js 20 or newer is required.' }

if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
  Step 'Installing dependencies (npm ci)'
  if (Test-Path (Join-Path $repo 'package-lock.json')) { Run 'npm' @('ci', '--no-audit', '--no-fund') }
  else { Run 'npm' @('install', '--no-audit', '--no-fund') }
}

if (-not (Test-Path (Join-Path $repo 'build\icon.ico'))) {
  Step 'Generating icon'
  Run 'node' @('scripts/make-icon.mjs')
}

if (-not $SkipChecks) {
  Step 'Running unit tests'
  Run 'npx' @('vitest', 'run')
  Step 'Type checking'
  Run 'npm' @('run', 'typecheck')
}

Step 'Compiling (electron-vite build)'
Run 'npx' @('electron-vite', 'build')

Step 'Preparing electron-builder tools cache'
Run 'node' @('scripts/prepare-wincodesign.mjs')

$targets = @('portable')
if ($Zip) { $targets += 'zip' }
Step "Packaging ($($targets -join ', '))"
Run 'npx' (@('electron-builder', '--win') + $targets + @('--x64', '--publish', 'never'))

Step 'Done'
Get-ChildItem (Join-Path $repo 'release') -File |
  Where-Object { $_.Extension -in '.exe', '.zip' } |
  ForEach-Object { '{0,-45} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) } |
  Write-Host
Write-Host "`nOutput folder: $(Join-Path $repo 'release')" -ForegroundColor Green
