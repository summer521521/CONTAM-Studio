param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$Root = "F:\Codex_File\temp\contam-studio-agent-08-installer-test"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$installerFull = (Resolve-Path $InstallerPath).Path
$allowedRoot = [IO.Path]::GetFullPath("F:\Codex_File\temp").TrimEnd("\") + "\"
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd("\")
if (-not $rootFull.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "isolated installer test root must be under F:\Codex_File\temp" }
New-Item -ItemType Directory -Path $rootFull -Force | Out-Null
$dataRoot = Join-Path $rootFull "user-data"
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$sentinel = Join-Path $dataRoot "preserve.txt"
Set-Content -LiteralPath $sentinel -Value "AGENT-08 sentinel" -Encoding UTF8
$installRoot = Join-Path $rootFull "installed"
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

if (-not $installerFull.EndsWith(".exe", [StringComparison]::OrdinalIgnoreCase)) { throw "isolated test expects an NSIS executable" }
$install = Start-Process -FilePath $installerFull -ArgumentList @("/S", "/D=$installRoot") -Wait -PassThru -WindowStyle Hidden
if ($install.ExitCode -ne 0) { throw "NSIS install failed with exit code $($install.ExitCode)" }
$app = @(Get-ChildItem -LiteralPath $installRoot -Recurse -File -Filter "*.exe")
$uninstaller = $app | Where-Object { $_.Name -match "(?i)^uninstall\.exe$" } | Select-Object -First 1
if ($app.Count -eq 0) { throw "NSIS installer produced no executable" }
if ($null -eq $uninstaller) { throw "NSIS uninstaller is missing" }

# Upgrade simulation: the same package must be able to run again without deleting the sentinel.
$upgrade = Start-Process -FilePath $installerFull -ArgumentList @("/S", "/D=$installRoot") -Wait -PassThru -WindowStyle Hidden
if ($upgrade.ExitCode -ne 0) { throw "NSIS upgrade simulation failed with exit code $($upgrade.ExitCode)" }
if (-not (Test-Path -LiteralPath $sentinel -PathType Leaf)) { throw "upgrade removed user data sentinel" }

$uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru -WindowStyle Hidden
if ($uninstallProcess.ExitCode -ne 0) { throw "NSIS uninstall failed with exit code $($uninstallProcess.ExitCode)" }
if (Test-Path -LiteralPath $installRoot) { throw "NSIS uninstall left application directory" }
if (-not (Test-Path -LiteralPath $sentinel -PathType Leaf)) { throw "NSIS uninstall removed user data sentinel" }

[ordered]@{
  installer = $installerFull
  install_root = $installRoot
  install = "passed"
  upgrade = "passed"
  uninstall = "passed"
  user_data_preserved = $true
  app_launch = "not_run_to_avoid_real_user_AppData"
} | ConvertTo-Json -Depth 4
