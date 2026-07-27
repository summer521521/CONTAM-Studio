param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-08",
  [string]$ToolchainRoot = "F:\Codex_File\toolchains\contam-studio-packaging",
  [switch]$SkipTauriBuild
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$target = Join-Path (Join-Path $ArtifactRoot $version) "installers"
New-Item -ItemType Directory -Path $target -Force | Out-Null
$resolver = Join-Path $PSScriptRoot "resolve-packaging-toolchain.ps1"
$toolchain = $null
$status = "blocked_environment"
$resolverError = $null
$localRepackage = $null
try {
  $toolchainJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resolver -ToolchainRoot $ToolchainRoot
  if ($LASTEXITCODE -ne 0) { throw "packaging toolchain resolver failed" }
  $toolchain = ($toolchainJson | Out-String | ConvertFrom-Json)
  $env:PATH = "$(Split-Path -Parent $toolchain.nsis.path);$($toolchain.candle.root);$env:PATH"
  # Tauri's verifier uses its cache, so keep that cache under the approved local toolchain root.
  $env:LOCALAPPDATA = $ToolchainRoot
  $status = "available"
} catch {
  $resolverError = $_.Exception.Message
}
if ($status -eq "available") {
  if (-not $SkipTauriBuild) {
    Push-Location $repo
    try {
      pnpm tauri build --bundles nsis msi --ci --no-sign
      if ($LASTEXITCODE -ne 0) { throw "Tauri installer build failed" }
    } finally { Pop-Location }
  } else {
    Write-Host "Tauri build skipped; using existing generated bundle inputs for local repackage."
  }
  $bundleRoot = Join-Path $repo "src-tauri\target\release\bundle"
  if (-not (Test-Path -LiteralPath $bundleRoot -PathType Container)) { throw "Tauri bundle output is missing" }
  $bundles = @(Get-ChildItem -LiteralPath $bundleRoot -File -Recurse | Where-Object { $_.Extension -in @(".exe", ".msi") })
  if ($bundles.Count -lt 2) { throw "expected NSIS and MSI artifacts were not produced" }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\repackage-bundles-local.ps1") -RepoRoot $repo -ArtifactInstallerRoot $target -ToolchainRoot $ToolchainRoot
  if ($LASTEXITCODE -ne 0) { throw "local installer repackage failed" }
  $localRepackage = [ordered]@{
    status = "local_repackaged"
    nsis_version = [string]$toolchain.nsis.version
    wix_version = [string]$toolchain.candle.version
    outputs = @(
      [ordered]@{ path = "CONTAM Studio_0.1.0_x64-setup.exe"; sha256 = (Get-FileHash -LiteralPath (Join-Path $target "CONTAM Studio_0.1.0_x64-setup.exe") -Algorithm SHA256).Hash.ToLowerInvariant() },
      [ordered]@{ path = "CONTAM Studio_0.1.0_x64_en-US.msi"; sha256 = (Get-FileHash -LiteralPath (Join-Path $target "CONTAM Studio_0.1.0_x64_en-US.msi") -Algorithm SHA256).Hash.ToLowerInvariant() }
    )
  }
} else {
  Write-Host "installer_status=$status; reason=$resolverError"
}
@{
  schema_version = 2
  version = $version
  status = $status
  unsigned_build = $true
  uploaded = $false
  toolchain_root = "external_toolchain_root"
  tauri_cache_root = "external_toolchain_root"
  resolver_error = $resolverError
  local_repackage = $localRepackage
  tools = @{
    makensis = [bool]($null -ne $toolchain)
    wix = [bool]($null -ne $toolchain)
    candle = [bool]($null -ne $toolchain)
    light = [bool]($null -ne $toolchain)
    nsis_version = if ($null -ne $toolchain) { $toolchain.nsis.version } else { $null }
    wix_version = if ($null -ne $toolchain) { $toolchain.candle.version } else { $null }
    tauri_nsis_utils_version = if ($null -ne $toolchain) { $toolchain.tauri_nsis_utils.version } else { $null }
  }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "installer-status.json") -Encoding UTF8
