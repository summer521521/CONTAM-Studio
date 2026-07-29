param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-06",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"

function Get-Sha256Hex([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$commit = git -C $repo rev-parse HEAD
$target = Join-Path $ArtifactRoot $version
$workerRoot = Join-Path $repo "src-tauri\runtime\python-worker"
$workerExecutable = Join-Path $workerRoot "contam-studio-python-worker.exe"
$workerManifestPath = Join-Path $workerRoot "runtime-manifest.json"
if (-not (Test-Path $ArtifactRoot)) { New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null }
$encodedSeparator = [string][char]0x1f
$releaseRustFlags = @(
  "--remap-path-prefix=$repo=.",
  "--remap-path-prefix=$($env:USERPROFILE)=.user"
)
if (-not [string]::IsNullOrWhiteSpace($env:CARGO_ENCODED_RUSTFLAGS)) {
  $releaseRustFlags = @($env:CARGO_ENCODED_RUSTFLAGS -split $encodedSeparator) + $releaseRustFlags
}
$env:CARGO_ENCODED_RUSTFLAGS = $releaseRustFlags -join $encodedSeparator
$nativePathMaps = @(
  "/pathmap:$($env:USERPROFILE)\.cargo=.",
  "/pathmap:$repo=."
)
$env:CFLAGS = (@($env:CFLAGS) + $nativePathMaps -join " ").Trim()
$env:CXXFLAGS = (@($env:CXXFLAGS) + $nativePathMaps -join " ").Trim()
if (Test-Path $target) {
  $resolvedRoot = (Resolve-Path $ArtifactRoot).Path
  $resolvedTarget = (Resolve-Path $target).Path
  if (-not $resolvedTarget.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "artifact target escaped artifact root" }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $target "portable") -Force | Out-Null
Push-Location $repo
try {
  pnpm verify:release
  if ($LASTEXITCODE -ne 0) { throw "release metadata verification failed" }
  if (-not $SkipBuild) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-python-worker.ps1")
    if ($LASTEXITCODE -ne 0) { throw "frozen Python worker build failed" }
    pnpm tauri build --no-bundle --ci --no-sign
    if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed" }
  }
  if (-not (Test-Path -LiteralPath $workerExecutable -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $workerRoot "_internal") -PathType Container) -or
      -not (Test-Path -LiteralPath $workerManifestPath -PathType Leaf)) {
    throw "complete frozen Python worker runtime is missing"
  }
  $workerManifest = Get-Content -LiteralPath $workerManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($workerManifest.commit_sha -ne $commit -or
      $workerManifest.detached_protocol_smoke -ne "passed" -or
      $workerManifest.detached_project_read -ne "passed" -or
      $workerManifest.source_tree_required -ne $false) {
    throw "frozen Python worker manifest does not match this release commit"
  }
  $binary = Join-Path $repo "src-tauri\target\release\contam-studio.exe"
  if (-not (Test-Path $binary)) { throw "Tauri release binary was not produced" }
  Copy-Item -LiteralPath $binary -Destination (Join-Path $target "portable\CONTAM-Studio.exe")
  $portableRuntime = Join-Path $target "portable\runtime\python-worker"
  New-Item -ItemType Directory -Path $portableRuntime -Force | Out-Null
  Copy-Item -Path (Join-Path $workerRoot "*") -Destination $portableRuntime -Recurse -Force
  foreach ($notice in @("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md")) {
    Copy-Item -LiteralPath (Join-Path $repo $notice) -Destination (Join-Path $target "portable\$notice")
  }
  $manifestFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $target "portable") -Recurse -File |
      Sort-Object FullName |
      ForEach-Object {
        [ordered]@{
          path = $_.FullName.Substring($target.TrimEnd("\").Length + 1).Replace("\", "/")
          sha256 = (Get-Sha256Hex $_.FullName)
        }
      }
  )
  $manifest = [ordered]@{
    schema_version = 2
    product = "CONTAM Studio"
    version = $version
    commit_sha = $commit
    build_kind = "release"
    unsigned_build = $true
    installer_status = "not_built_without_verified_windows_packager"
    clean_machine_acceptance = "blocked"
    frozen_worker = [ordered]@{
      kind = [string]$workerManifest.worker_kind
      python_version = [string]$workerManifest.python_version
      pyinstaller_version = [string]$workerManifest.pyinstaller_version
      dependency_lock_sha256 = [string]$workerManifest.dependency_lock_sha256
      detached_protocol_smoke = [string]$workerManifest.detached_protocol_smoke
      detached_project_read = [string]$workerManifest.detached_project_read
      source_tree_required = [bool]$workerManifest.source_tree_required
    }
    files = $manifestFiles
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "manifest.json") -Encoding UTF8
  node scripts/audit-release.mjs $target
  if ($LASTEXITCODE -ne 0) { throw "release artifact audit failed" }
  Write-Host "Portable artifact: $target"
  Write-Host "unsigned_build=true; no installer signing/upload was performed."
} finally { Pop-Location }
