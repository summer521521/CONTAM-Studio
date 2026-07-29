param(
  [string]$RepoRoot = "",
  [string]$ArtifactInstallerRoot = "",
  [string]$ToolchainRoot = "F:\Codex_File\toolchains\contam-studio-packaging",
  [string]$StageRoot = ""
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

$stageBase = if ([string]::IsNullOrWhiteSpace($StageRoot)) { "F:\Codex_File\temp" } else { $StageRoot }
$stage = Join-Path $stageBase ("contam-studio-local-repackage-" + [Guid]::NewGuid().ToString("N"))
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
$uninstallTarget = @'
Function un.onInit
  !insertmacro SetContext

  ; NSIS runs a direct uninstaller from a temporary extraction directory.
  ; Reinstall/update passes the original directory explicitly; direct
  ; uninstall resolves it from the current-user install record instead.
  ; The runtime cleanup and final RMDir below therefore target the real install root.
  ${GetOptions} $CMDLINE "/_?=" $R0
  ${IfNot} ${Errors}
    StrCpy $INSTDIR $R0
  ${Else}
    ReadRegStr $R0 SHCTX "${MANUPRODUCTKEY}" ""
    ${If} $R0 != ""
      StrCpy $INSTDIR $R0
    ${EndIf}
  ${EndIf}
'@
$uninstallPattern = '(?m)^Function un\.onInit\r?\n  !insertmacro SetContext\r?\n'
if (-not [regex]::IsMatch($nsisScript, $uninstallPattern)) { throw "generated NSIS un.onInit block is missing" }
$nsisScript = [regex]::Replace(
  $nsisScript,
  $uninstallPattern,
  [Text.RegularExpressions.MatchEvaluator]{ param($match) $uninstallTarget },
  1
)

# Keep the safe default even when the generated page implementation changes.
$confirmTextLine = '!define MUI_UNCONFIRMPAGE_TEXT_TOP "CONTAM Studio will be uninstalled. Click Uninstall to continue."'
$confirmPageAnchor = '!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive'
if (-not $nsisScript.Contains($confirmPageAnchor)) { throw "NSIS uninstall confirmation page hook is missing" }
if (-not $nsisScript.Contains($confirmTextLine)) {
  $nsisScript = $nsisScript.Replace($confirmPageAnchor, "$confirmTextLine`r`n$confirmPageAnchor")
}

$hideUninstallLocation = @(
  '  GetDlgItem $4 $1 1029',
  '  ShowWindow $4 ${SW_HIDE}',
  '  GetDlgItem $5 $1 1000',
  '  ShowWindow $5 ${SW_HIDE}'
) -join "`r`n"
$defaultDataState = '  SendMessage $DeleteAppDataCheckbox ${BM_SETCHECK} ${BST_UNCHECKED} 0'
$fontLine = '  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1'
if (-not $nsisScript.Contains($fontLine)) { throw "NSIS app-data checkbox hook is missing" }
if (-not $nsisScript.Contains('ShowWindow $4 ${SW_HIDE}')) {
  $nsisScript = $nsisScript.Replace($fontLine, "$fontLine`r`n$hideUninstallLocation")
}
if (-not $nsisScript.Contains($defaultDataState)) { $nsisScript = $nsisScript.Replace($fontLine, "$fontLine`r`n$defaultDataState") }

foreach ($requiredMarker in @(
  'ReadRegStr $R0 SHCTX "${MANUPRODUCTKEY}" ""',
  'StrCpy $INSTDIR $R0',
  $defaultDataState,
  $confirmTextLine,
  'ShowWindow $4 ${SW_HIDE}',
  'ShowWindow $5 ${SW_HIDE}'
)) {
  if (-not $nsisScript.Contains($requiredMarker)) { throw "NSIS uninstall patch was not applied: $requiredMarker" }
}
$temporaryInstallTarget = 'StrCpy $INSTDIR "' + '$EXEDIR"'
if ($nsisScript.Contains($temporaryInstallTarget)) { throw 'NSIS uninstall target must not use the temporary $EXEDIR' }
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
