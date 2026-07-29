param(
  [string]$RepoRoot = "",
  [string]$ArtifactInstallerRoot = "",
  [string]$ToolchainRoot = "F:\Codex_File\toolchains\contam-studio-packaging"
)

Set-StrictMode -Version Latest
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
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
if ([string]::IsNullOrWhiteSpace($ArtifactInstallerRoot)) { throw "ArtifactInstallerRoot is required" }
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
$ArtifactInstallerRoot = [IO.Path]::GetFullPath($ArtifactInstallerRoot).TrimEnd("\")
$version = node -p "require('$($RepoRoot.Replace('\', '/'))/package.json').version"
$manifestPath = Join-Path $RepoRoot "docs\release\agent-08-packaging-toolchain.json"
$resolver = Join-Path $RepoRoot "scripts\resolve-packaging-toolchain.ps1"
$toolchain = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resolver -ToolchainRoot $ToolchainRoot | Out-String | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw "packaging toolchain resolver failed" }

$nsisPath = [string]$toolchain.nsis.path
$candlePath = [string]$toolchain.candle.path
$lightPath = [string]$toolchain.light.path
$sourceNsisRoot = Join-Path $RepoRoot "src-tauri\target\release\nsis\x64"
$sourceWixRoot = Join-Path $RepoRoot "src-tauri\target\release\wix\x64"
foreach ($required in @(
  (Join-Path $sourceNsisRoot "installer.nsi"),
  (Join-Path $sourceNsisRoot "utils.nsh"),
  (Join-Path $sourceNsisRoot "FileAssociation.nsh"),
  (Join-Path $sourceNsisRoot "English.nsh"),
  (Join-Path $sourceWixRoot "main.wxs"),
  (Join-Path $sourceWixRoot "locale.wxl")
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "generated packaging input is missing: $required" }
}

$stage = Join-Path "F:\Codex_File\temp" ("contam-studio-agent-08-local-repackage-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$pluginRoot = Join-Path $ToolchainRoot "nsis-tauri-plugins"
$scriptPath = Join-Path $stage "installer.nsi"
Copy-Item -LiteralPath (Join-Path $sourceNsisRoot "English.nsh"), (Join-Path $sourceNsisRoot "FileAssociation.nsh"), (Join-Path $sourceNsisRoot "utils.nsh") -Destination $stage
$nsisScript = Get-Content -LiteralPath (Join-Path $sourceNsisRoot "installer.nsi") -Raw -Encoding UTF8
$nsisScript = [regex]::Replace($nsisScript, '(?m)^!define ADDITIONALPLUGINSPATH .*$', ('!define ADDITIONALPLUGINSPATH "' + $pluginRoot + '"'))
foreach ($include in @("utils.nsh", "FileAssociation.nsh", "English.nsh")) {
  $absoluteInclude = Join-Path $stage $include
  $nsisScript = $nsisScript.Replace(('!include "' + $include + '"'), ('!include "' + $absoluteInclude + '"'))
}
Set-Content -LiteralPath $scriptPath -Value $nsisScript -Encoding ASCII

Push-Location $stage
try {
  & $nsisPath /NOCD $scriptPath 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "local NSIS repackage failed" }
} finally { Pop-Location }
$nsisOutput = Join-Path $stage "nsis-output.exe"
if (-not (Test-Path -LiteralPath $nsisOutput -PathType Leaf)) { throw "local NSIS output is missing" }
$wixObj = Join-Path $stage "main.wixobj"
$msiOutput = Join-Path $stage "contam-studio-local.msi"
& $candlePath -nologo -out $wixObj (Join-Path $sourceWixRoot "main.wxs") 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "local WiX candle failed" }
& $lightPath -nologo -ext (Join-Path $toolchain.candle.root "WixUIExtension.dll") -ext (Join-Path $toolchain.candle.root "WixUtilExtension.dll") -loc (Join-Path $sourceWixRoot "locale.wxl") -out $msiOutput $wixObj 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "local WiX light failed" }
if (-not (Test-Path -LiteralPath $msiOutput -PathType Leaf)) { throw "local MSI output is missing" }

New-Item -ItemType Directory -Path $ArtifactInstallerRoot -Force | Out-Null
$nsisDestination = Join-Path $ArtifactInstallerRoot "CONTAM Studio_$($version)_x64-setup.exe"
$msiDestination = Join-Path $ArtifactInstallerRoot "CONTAM Studio_$($version)_x64_en-US.msi"
Copy-Item -LiteralPath $nsisOutput -Destination $nsisDestination -Force
Copy-Item -LiteralPath $msiOutput -Destination $msiDestination -Force

[ordered]@{
  schema_version = 1
  status = "local_repackaged"
  unsigned_build = $true
  nsis_version = [string]$toolchain.nsis.version
  wix_version = [string]$toolchain.candle.version
  outputs = @(
    [ordered]@{ path = (Split-Path -Leaf $nsisDestination); sha256 = (Get-Sha256Hex $nsisDestination) },
    [ordered]@{ path = (Split-Path -Leaf $msiDestination); sha256 = (Get-Sha256Hex $msiDestination) }
  )
} | ConvertTo-Json -Depth 6
