[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TaskRoot = "F:\Codex_File\phase-6c-user-first-runtime\contam-tools",
    [string]$ApprovedTaskRoot = "F:\Codex_File\phase-6c-user-first-runtime"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256Hex([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Assert-Same([string]$Actual, [string]$Expected, [string]$Name) {
    if ($Actual -ne $Expected.ToUpperInvariant()) {
        throw "NIST tool hash mismatch for ${Name}. Expected ${Expected}, got ${Actual}."
    }
}

$repo = [IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
$task = [IO.Path]::GetFullPath($TaskRoot).TrimEnd("\")
$approvedTask = [IO.Path]::GetFullPath($ApprovedTaskRoot).TrimEnd("\")
if (-not $task.StartsWith("${approvedTask}\", [StringComparison]::OrdinalIgnoreCase) -and $task -ne $approvedTask) {
    throw "NIST tool download and extraction must stay under the approved task temporary directory."
}

$builder = Join-Path $repo "scripts\build-contam-tools.ps1"
$zip = Join-Path $task "download\contam-x-3.4.0.3-win64.zip"
$builderArgs = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $builder,
    "-DestinationRoot", $task,
    "-ApprovedTempRoot", $approvedTask
)
if (Test-Path -LiteralPath $zip -PathType Leaf) {
    $builderArgs += @("-SkipDownload", "-ZipPath", $zip)
}
& powershell.exe @builderArgs
if ($LASTEXITCODE -ne 0) { throw "NIST tool acquisition failed." }

$lockPath = Join-Path $repo "resources\contam-tools.lock.json"
$manifestPath = Join-Path $task "contam-tools.manifest.json"
$lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$manifest.zip_sha256 -ne [string]$lock.zip_sha256) { throw "NIST ZIP lock digest does not match the verified acquisition." }
if ([string]$manifest.download_url -ne [string]$lock.download_url) { throw "NIST download URL differs from the lock file." }

$manifestFiles = @($manifest.files)
$lockFiles = @($lock.files)
if ($manifestFiles.Count -ne $lockFiles.Count) { throw "NIST runtime file list differs from the lock file." }
foreach ($locked in $lockFiles) {
    $actual = $manifestFiles | Where-Object { [string]$_.file -eq [string]$locked.file } | Select-Object -First 1
    if ($null -eq $actual) { throw "NIST runtime file is missing from the acquisition manifest: $($locked.file)" }
    Assert-Same ([string]$actual.sha256) ([string]$locked.sha256) ([string]$locked.file)
}

$sourceRuntime = Join-Path $task "runtime"
$repoRuntime = Join-Path $repo "src-tauri\runtime\contam-tools"
if (-not (Test-Path -LiteralPath $sourceRuntime -PathType Container)) { throw "Verified NIST runtime directory is missing." }
New-Item -ItemType Directory -Path $repoRuntime -Force | Out-Null
Get-ChildItem -LiteralPath $repoRuntime -Force |
    Where-Object { $_.Name -ne "README.md" } |
    Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $sourceRuntime "*") -Destination $repoRuntime -Recurse -Force

foreach ($locked in $lockFiles) {
    $runtimeFile = Join-Path $repoRuntime ([string]$locked.file)
    if (-not (Test-Path -LiteralPath $runtimeFile -PathType Leaf)) {
        throw "Verified NIST runtime file was not copied: $($locked.file)"
    }
    Assert-Same (Get-Sha256Hex $runtimeFile) ([string]$locked.sha256) ([string]$locked.file)
}

[ordered]@{
    status = "verified_and_synced"
    task_root = "approved_phase_6c_temp"
    lock_file = "resources/contam-tools.lock.json"
    runtime_root = "src-tauri/runtime/contam-tools"
    files = @($lockFiles | ForEach-Object { [string]$_.file })
} | ConvertTo-Json -Depth 4
