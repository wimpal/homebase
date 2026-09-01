# Deploy Homebase to the NAS.
#
# Default: git pull on the NAS SMB share, then docker compose via SSH.
# PC setup (SSH key, docker group): docs/nas-pc-setup.md
#
# npm run deploy:nas runs deploy-preflight.ps1 (build) then this script with -SkipPreflight.
# Post-deploy: mcp:smoke against http://<NAS>:3000 when SERVICE_TOKEN + MCP_HOUSEHOLD_ID are set.
#
#   npm run deploy:nas
#   npm run deploy:nas -- -Push
#   npm run deploy:nas -- -SkipPreflight -SkipSmoke
#   npm run deploy:nas -- -UseScp

param(
    [string]$NasHost,
    [string]$NasUser,
    [string]$NasPath,
    [string]$NasShare,
    [string]$Branch,
    [switch]$Push,
    [switch]$UseScp,
    [switch]$SkipPreflight,
    [switch]$SkipSmoke,
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

function Import-McpSmokeEnv {
    param(
        [string]$NasShare,
        [string]$RepoRoot
    )
    # Docker on NAS reads .env from the deploy tree — smoke must use the same tokens.
    $candidates = @(
        (Join-Path $NasShare ".env"),
        (Join-Path $RepoRoot ".env")
    )
    foreach ($path in $candidates) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        Write-Host "Loading MCP smoke credentials from $path"
        Get-Content -LiteralPath $path | ForEach-Object {
            $line = $_.Trim()
            if ($line -eq "" -or $line.StartsWith("#")) { return }
            $eq = $line.IndexOf("=")
            if ($eq -lt 1) { return }
            $name = $line.Substring(0, $eq).Trim()
            $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
            if ($name -eq "SERVICE_TOKEN" -or $name -eq "MCP_HOUSEHOLD_ID") {
                if ($value) {
                    Set-Item -Path "Env:$name" -Value $value
                }
            }
        }
        if ($env:SERVICE_TOKEN -and $env:MCP_HOUSEHOLD_ID) {
            return
        }
    }
}

function Import-McpSmokeEnvFromContainer {
    param(
        [string]$Remote,
        [int]$SshPort,
        [string]$NasPath
    )
    $cmd = "set -eu && cd '$NasPath' && docker compose exec -T app printenv SERVICE_TOKEN MCP_HOUSEHOLD_ID"
    Write-Host "Reading MCP smoke credentials from running app container on NAS..."
    $output = & ssh -p $SshPort $Remote $cmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not read SERVICE_TOKEN from container: $output"
        return $false
    }
    foreach ($line in @($output)) {
        $text = "$line".Trim()
        if ($text -match '^SERVICE_TOKEN=(.*)$') {
            $env:SERVICE_TOKEN = $Matches[1].Trim().Trim('"').Trim("'")
        }
        elseif ($text -match '^MCP_HOUSEHOLD_ID=(.*)$') {
            $env:MCP_HOUSEHOLD_ID = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    if ($env:SERVICE_TOKEN -and $env:MCP_HOUSEHOLD_ID) {
        Write-Host "MCP smoke credentials loaded from container (token length $($env:SERVICE_TOKEN.Length))"
        return $true
    }
    Write-Warning "Container did not return SERVICE_TOKEN and MCP_HOUSEHOLD_ID"
    return $false
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

function Get-DockerRemoteCmd {
    param([string]$TargetNasPath)
    return (
        "set -eu && " +
        "cd '$TargetNasPath' && " +
        "docker compose up --build -d && " +
        "docker compose exec -T worker npx prisma db push && " +
        "docker compose logs --tail=30 && " +
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

Import-DotEnv (Join-Path $repoRoot ".env")

if (-not $NasHost) { $NasHost = $(if ($env:NAS_HOST) { $env:NAS_HOST } else { "192.168.1.142" }) }
if (-not $NasUser) { $NasUser = $(if ($env:NAS_USER) { $env:NAS_USER } else { "wim" }) }
if (-not $NasPath) { $NasPath = $(if ($env:NAS_PATH) { $env:NAS_PATH } else { "/volume1/docker/homebase" }) }
if (-not $NasShare) { $NasShare = $(if ($env:NAS_SHARE) { $env:NAS_SHARE } else { "\\192.168.1.142\docker\homebase" }) }
if (-not $Branch) { $Branch = $(if ($env:NAS_BRANCH) { $env:NAS_BRANCH } else { "main" }) }
if (-not $SshPort -or $SshPort -eq 0) {
    $SshPort = $(if ($env:NAS_SSH_PORT) { [int]$env:NAS_SSH_PORT } else { 22 })
}
if (-not $UseScp -and $env:NAS_USE_SCP -match '^(1|true|yes)$') {
    $UseScp = $true
}

$remote = "${NasUser}@${NasHost}"
$useShare = (-not $UseScp) -and (Test-NasShareReady $NasShare)

if (-not $SkipPreflight) {
    Write-Host "Running pre-deploy build (deploy-preflight.ps1)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "deploy-preflight.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Push) {
    Write-Host "Pushing $Branch to origin from $repoRoot ..."
    Invoke-Git @("push", "origin", $Branch)
}

if ($useShare) {
    Write-Host "Deploy mode: NAS share (git pull)"
    Write-Host "Pulling $Branch on NAS share $NasShare ..."
    $dirty = & git -C $NasShare status --porcelain
    if ($dirty) {
        Write-Host ""
        Write-Host "NAS share has local modifications (will block pull):" -ForegroundColor Yellow
        & git -C $NasShare status --short
        Write-Host ""
        Write-Error @"
Deploy aborted - the NAS share is not a clean git checkout.
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

    $remoteCmd = Get-DockerRemoteCmd -TargetNasPath $NasPath
    Write-Host "Building on NAS (${remote}:${NasPath})..."
    & ssh -p $SshPort $remote $remoteCmd
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
    if ($UseScp) {
        Write-Host "Deploy mode: scp (explicit)"
    }
    else {
        Write-Warning "NAS share not reachable at $NasShare — falling back to scp upload."
    }

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

    Write-Host "Packaging $Branch..."
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
            (Get-DockerRemoteCmd -TargetNasPath $NasPath)
        )

        Write-Host "Building on NAS (${remote}:${NasPath})..."
        & ssh -p $SshPort $remote $remoteCmd
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        if (Test-Path -LiteralPath $localTar) { Remove-Item -LiteralPath $localTar -Force }
    }
}

if (-not $SkipSmoke) {
    $smokeCredsOk = Import-McpSmokeEnvFromContainer -Remote $remote -SshPort $SshPort -NasPath $NasPath
    if (-not $smokeCredsOk) {
        Import-McpSmokeEnv -NasShare $NasShare -RepoRoot $repoRoot
    }
    if (-not $env:SERVICE_TOKEN -or -not $env:MCP_HOUSEHOLD_ID) {
        Write-Warning "Skipping mcp:smoke - set SERVICE_TOKEN and MCP_HOUSEHOLD_ID in NAS .env (or local .env)."
    }
    else {
        Write-Host "Post-deploy MCP smoke (http://${NasHost}:3000)..."
        Push-Location $repoRoot
        try {
            $prevBase = $env:MCP_BASE_URL
            $env:MCP_BASE_URL = "http://${NasHost}:3000"
            $env:HOMEBASE_SMOKE_SKIP_DOTENV = "1"
            & npm run mcp:smoke
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Post-deploy mcp:smoke failed."
                exit $LASTEXITCODE
            }
            Write-Host "Post-deploy MCP smoke OK."
        }
        finally {
            if ($null -ne $prevBase) { $env:MCP_BASE_URL = $prevBase }
            else { Remove-Item Env:MCP_BASE_URL -ErrorAction SilentlyContinue }
            Remove-Item Env:HOMEBASE_SMOKE_SKIP_DOTENV -ErrorAction SilentlyContinue
            Pop-Location
        }
    }
}
else {
    Write-Host "Skipping post-deploy MCP smoke (-SkipSmoke)."
}

Write-Host ""
Write-Host "Deploy finished. App: http://${NasHost}:3000/"
