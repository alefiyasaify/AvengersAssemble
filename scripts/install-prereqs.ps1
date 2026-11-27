<#
.SYNOPSIS
  Installs the developer prerequisites on Windows (user scope where possible) via winget.

.DESCRIPTION
  Installs only what is missing: Git (incl. Git Bash), GNU make, Python 3.12, uv, Node.js LTS,
  pnpm, Docker Desktop, and pre-commit (as a uv tool). Safe to re-run.
  Afterwards: restart your terminal / VS Code, open Git Bash, and run `make doctor`.

  NOTE: `pip install make` does NOT install GNU make (it is an unrelated template tool).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-prereqs.ps1
#>
[CmdletBinding()]
param(
    [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error 'winget is required (Windows 10 1809+ / Windows 11, "App Installer" from the Microsoft Store).'
}

function Update-SessionPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Install-IfMissing {
    param(
        [Parameter(Mandatory)] [string]$Command,
        [Parameter(Mandatory)] [string]$WingetId,
        [string]$Scope = 'user'
    )
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-Host "[ok]      $Command already installed"
        return
    }
    Write-Host "[install] $Command ($WingetId)"
    $scopeArgs = @()
    if ($Scope) { $scopeArgs = @('--scope', $Scope) }
    winget install --id $WingetId -e @scopeArgs --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { Write-Warning "winget returned $LASTEXITCODE for $WingetId" }
    Update-SessionPath
}

Install-IfMissing -Command git    -WingetId 'Git.Git'            -Scope ''
Install-IfMissing -Command make   -WingetId 'ezwinports.make'
Install-IfMissing -Command python -WingetId 'Python.Python.3.12'
Install-IfMissing -Command uv     -WingetId 'astral-sh.uv'
Install-IfMissing -Command node   -WingetId 'OpenJS.NodeJS.LTS'  -Scope ''
Install-IfMissing -Command pnpm   -WingetId 'pnpm.pnpm'
if (-not $SkipDocker) {
    Install-IfMissing -Command docker -WingetId 'Docker.DockerDesktop' -Scope ''
}

if (-not (Get-Command pre-commit -ErrorAction SilentlyContinue)) {
    Write-Host '[install] pre-commit (uv tool)'
    uv tool install pre-commit
    uv tool update-shell
    Update-SessionPath
} else {
    Write-Host '[ok]      pre-commit already installed'
}

Write-Host ''
Write-Host 'Done. Restart your terminal (and VS Code), open Git Bash in the repo, then run:'
Write-Host '  make doctor'
Write-Host '  make setup'
