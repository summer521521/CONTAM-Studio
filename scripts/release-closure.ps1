param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-08",
  [string]$ToolchainRoot = "F:\Codex_File\toolchains\contam-studio-packaging",
  [switch]$SkipBuild,
  [switch]$ResetArtifacts,
  [switch]$RequireInstallers
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$commit = git -C $repo rev-parse HEAD
$target = Join-Path $ArtifactRoot $version

if ($ResetArtifacts -and (Test-Path -LiteralPath $target)) {
  $rootFull = (Resolve-Path $ArtifactRoot).Path
  $targetFull = (Resolve-Path $target).Path
  if (-not $targetFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw "artifact target escaped artifact root" }
  Remove-Item -LiteralPath $targetFull -Recurse -Force
}

if (-not $SkipBuild) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-release.ps1") -ArtifactRoot $ArtifactRoot
  if ($LASTEXITCODE -ne 0) { throw "portable build failed" }
}

if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw "portable artifact directory is missing" }
$portable = Join-Path $target "portable\CONTAM-Studio.exe"
if (-not (Test-Path -LiteralPath $portable -PathType Leaf)) { throw "portable executable is missing" }

$installers = Join-Path $target "installers"
New-Item -ItemType Directory -Path $installers -Force | Out-Null
$installerArgs = @(
  "-ArtifactRoot", $ArtifactRoot,
  "-ToolchainRoot", $ToolchainRoot
)
if ($SkipBuild) { $installerArgs += "-SkipTauriBuild" }
$buildOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-installers.ps1") @installerArgs
if ($LASTEXITCODE -ne 0) { throw "installer build failed" }
$buildOutput | ForEach-Object { Write-Host $_ }
$installerInfoPath = Join-Path $installers "installer-status.json"
$installerInfo = Get-Content -LiteralPath $installerInfoPath -Raw -Encoding UTF8 | ConvertFrom-Json
$installerStatus = if ($installerInfo.status -eq "available") { "built_unsigned" } else { "blocked_environment" }
$tools = $installerInfo.tools

$manifestPath = Join-Path $target "manifest.json"
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $manifest.installer_status = $installerStatus
  $manifest.clean_machine_acceptance = "blocked"
  if ($installerInfo.local_repackage -and $installerInfo.local_repackage.outputs) {
    $manifestFiles = @($manifest.files)
    foreach ($output in @($installerInfo.local_repackage.outputs)) {
      $manifestFiles += [ordered]@{ path = ("installers/" + [string]$output.path); sha256 = [string]$output.sha256 }
    }
    $manifest.files = $manifestFiles
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

$installerInfo = [ordered]@{
  schema_version = 2
  version = $version
  commit_sha = $commit
  status = $installerStatus
  unsigned_build = $true
  uploaded = $false
  packager_tools = $tools
  local_repackage = $installerInfo.local_repackage
  toolchain_root = "external_toolchain_root"
}
$installerInfo | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $installers "installer-status.json") -Encoding UTF8

$status = [ordered]@{
  schema_version = 1
  version = $version
  commit_sha = $commit
  portable_build = "passed"
  installer_build = $installerStatus
  clean_windows_install = "blocked"
  independent_clean_windows = "not_run"
  local_installer_install = "not_run_host_registry_protected"
  signature = "unsigned"
  frozen_worker = "passed"
  windows_process_tree = "passed"
  official_contamx_simread = "not_tested"
  packager_tools = $tools
  local_repackage = $installerInfo.local_repackage
  toolchain_root = "external_toolchain_root"
}
$status | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target "release-closure-status.json") -Encoding UTF8
$diagnostics = Join-Path $target "diagnostics\release-diagnostics.json"
New-Item -ItemType Directory -Path (Split-Path -Parent $diagnostics) -Force | Out-Null
if (Test-Path -LiteralPath $diagnostics) { Remove-Item -LiteralPath $diagnostics -Force }
node (Join-Path $repo "scripts\generate-release-diagnostics.mjs") $diagnostics $version $commit "not_tested" "not_tested"
if ($LASTEXITCODE -ne 0) { throw "sanitized diagnostics generation failed" }
node (Join-Path $repo "scripts\audit-release.mjs") $target
if ($LASTEXITCODE -ne 0) { throw "release artifact audit failed" }
$assetArgs = @("-ArtifactRoot", $ArtifactRoot)
if ($RequireInstallers) { $assetArgs += "-RequireInstallers" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\prepare-release-assets.ps1") @assetArgs
if ($LASTEXITCODE -ne 0) { throw "release asset preparation failed" }
$status | ConvertTo-Json -Depth 6
