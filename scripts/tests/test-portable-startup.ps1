param(
  [string]$Binary = "F:\Codex_File\artifacts\contam-studio\agent-07\0.1.0\portable\CONTAM-Studio.exe",
  [int]$WaitSeconds = 8
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Binary -PathType Leaf)) { throw "portable binary missing: $Binary" }
$workingDirectory = Split-Path -Parent $Binary
$process = Start-Process -FilePath $Binary -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru
try {
  Start-Sleep -Seconds $WaitSeconds
  if ($process.HasExited) {
    throw "portable process exited during startup with code $($process.ExitCode)"
  }
  Write-Host "portable startup passed: process remained alive for ${WaitSeconds}s"
} finally {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
}
