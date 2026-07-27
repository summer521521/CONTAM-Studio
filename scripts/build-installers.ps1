param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-06"
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$target = Join-Path (Join-Path $ArtifactRoot $version) "installers"
New-Item -ItemType Directory -Path $target -Force | Out-Null
$nsis = Get-Command makensis -ErrorAction SilentlyContinue
$wix = Get-Command wix -ErrorAction SilentlyContinue
$candle = Get-Command candle -ErrorAction SilentlyContinue
$light = Get-Command light -ErrorAction SilentlyContinue
$status = if ($nsis -and $wix -and $candle -and $light) { "available" } else { "not_built_without_verified_windows_packager" }
if ($status -eq "available") {
  Push-Location $repo
  try { pnpm tauri build --bundles nsis,msi --ci --no-sign } finally { Pop-Location }
} else {
  Write-Host "installer_status=$status"
  Write-Host "No NSIS/WiX toolchain was found; no installer was generated."
}
@{
  schema_version = 1
  version = $version
  status = $status
  unsigned_build = $true
  uploaded = $false
  tools = @{
    makensis = [bool]$nsis
    wix = [bool]$wix
    candle = [bool]$candle
    light = [bool]$light
  }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "installer-status.json") -Encoding UTF8
