# Deploy Homebase to the NAS.
#
# Default: git pull on the NAS SMB share, then docker compose via SSH.
# Optional: copy .env.example to .env in the repo root (gitignored).
#
#   npm run deploy:nas
#   npm run deploy:nas -- -Push
#   npm run deploy:nas -- -UseScp    # skip share; upload tarball instead

[CmdletBinding()]
param(
    [string]$NasHost,
    [string]$NasUser,
    [string]$NasPath,
    [string]$NasShare,
    [string]$Branch,
    [switch]$Push,
    [switch]$UseScp,
    [int]$SshPort = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if (-not $name) { return }
        if ($name -like "NAS_*") {
            Set-Item -Path "Env:$name" -Value $value
        }
        elseif (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

function Get-DeployTempFile {
    $tempDir = [Environment]::GetEnvironmentVariable("TEMP", "Process")
    if (-not $tempDir) { $tempDir = [Environment]::GetEnvironmentVariable("TMP", "Process") }
    if (-not $tempDir) { $tempDir = $repoRoot }
    return [System.IO.Path]::Combine($tempDir, "homebase-deploy.tar.gz")
}

function Get-ShareChildPath {
    param([string]$ShareRoot, [string]$Child)
    $root = $ShareRoot.TrimEnd('\')
    return "$root\$Child"
}

function Test-NasShareReady {
    param([string]$ShareRoot)
    if ([string]::IsNullOrWhiteSpace($ShareRoot)) { return $false }
    if (-not (Test-Path -LiteralPath $ShareRoot)) { return $false }
    $gitDir = Get-ShareChildPath $ShareRoot ".git"
    return Test-Path -LiteralPath $gitDir
}

Import-DotEnv (Join-Path $repoRoot ".env")

if (-not $PSBoundParameters.ContainsKey("NasHost")) {
    $NasHost = $(if ($env:NAS_HOST) { $env:NAS_HOST } else { "192.168.0.170" })
}
if (-not $PSBoundParameters.ContainsKey("NasUser")) {
    $NasUser = $(if ($env:NAS_USER) { $env:NAS_USER } else { "wim" })
}
if (-not $PSBoundParameters.ContainsKey("NasPath")) {
    $NasPath = $(if ($env:NAS_PATH) { $env:NAS_PATH } else { "/volume1/docker/homebase" })
}
if (-not $PSBoundParameters.ContainsKey("NasShare")) {
    $NasShare = $(if ($env:NAS_SHARE) { $env:NAS_SHARE } else { "\\192.168.0.170\docker\homebase" })
}
if (-not $PSBoundParameters.ContainsKey("Branch")) {
    $Branch = $(if ($env:NAS_BRANCH) { $env:NAS_BRANCH } else { "main" })
}
if (-not $PSBoundParameters.ContainsKey("SshPort") -or $SshPort -eq 0) {
    $SshPort = $(if ($env:NAS_SSH_PORT) { [int]$env:NAS_SSH_PORT } else { 22 })
}
if (-not $UseScp -and $env:NAS_USE_SCP -match '^(1|true|yes)$') {
    $UseScp = $true
}

$remote = "${NasUser}@${NasHost}"
$useShare = (-not $UseScp) -and (Test-NasShareReady $NasShare)

function Get-DockerRemoteCmd {
    return (
        "set -eu && " +
        "cd '$NasPath' && " +
        "sudo docker compose up --build -d && " +
        "sudo docker compose exec -T worker npx prisma db push && " +
        "sudo docker compose logs --tail=30 && " +
        "sleep 2 && " +
        "curl -sf http://127.0.0.1:3000/health"
    )
}

function Invoke-Git {
    param(
        [string]$WorkTree = $repoRoot,
        [string[]]$GitArgs
    )
    & git -C $WorkTree @GitArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-DockerOnNas {
    $remoteCmd = Get-DockerRemoteCmd

    Write-Host "Building on NAS (${remote}:${NasPath})..."
    Write-Host "You may be prompted for your SSH and sudo passwords."

    & ssh -p $SshPort -t $remote $remoteCmd
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Deploy-ViaShare {
    Write-Host "Pulling $Branch on NAS share $NasShare ..."
    $dirty = & git -C $NasShare status --porcelain
    if ($dirty) {
        Write-Host ""
        Write-Host "NAS share has local modifications (will block pull):" -ForegroundColor Yellow
        & git -C $NasShare status --short
        Write-Host ""
        Write-Error @"
Deploy aborted — the NAS share is not a clean git checkout.
Review the files above on $NasShare. Either:
  - commit and push them from the NAS (if intentional), or
  - discard manually: git -C '$NasShare' checkout -- .
  - stash: git -C '$NasShare' stash push -m 'pre-deploy'
Then re-run npm run deploy:nas
"@
        exit 1
    }
    Invoke-Git -WorkTree $NasShare @("fetch", "origin", $Branch)
    Invoke-Git -WorkTree $NasShare @("checkout", $Branch)
    Invoke-Git -WorkTree $NasShare @("pull", "--ff-only", "origin", $Branch)
}

function Deploy-ViaScp {
    param([switch]$Explicit)

    $remoteTar = "/tmp/homebase-deploy.tar.gz"
    $localTar = Get-DeployTempFile

    $dirty = & git -C $repoRoot status --porcelain
    if ($dirty) {
        Write-Warning "Uncommitted changes are not included — only committed files on $Branch are deployed."
    }

    if (-not (git -C $repoRoot rev-parse --verify "$Branch^{commit}" 2>$null)) {
        Write-Error "Branch '$Branch' not found in $repoRoot. Commit first or pick another branch."
        exit 1
    }

    if ($Explicit) {
        Write-Host "Packaging $Branch for scp deploy..."
    }
    else {
        Write-Warning "NAS share not reachable at $NasShare — falling back to scp upload."
        Write-Host "Packaging $Branch..."
    }

    if (Test-Path -LiteralPath $localTar) { Remove-Item -LiteralPath $localTar -Force }
    Invoke-Git @("archive", "--format=tar.gz", "-o", $localTar, $Branch)

    try {
        Write-Host "Uploading to ${remote}:${remoteTar} ..."
        & scp -P $SshPort $localTar "${remote}:${remoteTar}"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        $remoteCmd = (
            "set -eu && " +
            "mkdir -p '$NasPath' && " +
            "cd '$NasPath' && " +
            "tar xzf '$remoteTar' && " +
            "rm -f '$remoteTar' && " +
            (Get-DockerRemoteCmd)
        )

        Write-Host "Building on NAS (${remote}:${NasPath})..."
        Write-Host "You may be prompted for your SSH and sudo passwords."

        & ssh -p $SshPort -t $remote $remoteCmd
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        if (Test-Path -LiteralPath $localTar) { Remove-Item -LiteralPath $localTar -Force }
    }
}

if ($Push) {
    Write-Host "Pushing $Branch to origin from $repoRoot ..."
    Invoke-Git @("push", "origin", $Branch)
}

if ($useShare) {
    Write-Host "Deploy mode: NAS share (git pull)"
    Deploy-ViaShare
    Invoke-DockerOnNas
}
else {
    if ($UseScp) {
        Write-Host "Deploy mode: scp (explicit)"
    }
    Deploy-ViaScp -Explicit:$UseScp
}

Write-Host ""
Write-Host "Deploy finished. App: http://${NasHost}:3000/"
