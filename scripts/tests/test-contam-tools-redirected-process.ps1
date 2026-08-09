[CmdletBinding()]
param([string]$TaskRoot = "")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $repo "scripts\lib\contam-temp-root.ps1")

function Quote-ProcessArgument {
    param([Parameter(Mandatory = $true)][string]$Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

$root = if ([string]::IsNullOrWhiteSpace($TaskRoot)) {
    Resolve-ContamTempRoot
} else {
    Resolve-ContamAbsolutePath $TaskRoot
}
$caseRoot = Join-Path $root ("tests\redirected process with spaces " + [Guid]::NewGuid().ToString("N"))
$runnerTemp = Join-Path $caseRoot "runner temp with spaces"
$archiveRoot = Join-Path $runnerTemp "tampered archive source"
$payloadRoot = Join-Path $archiveRoot "payload files"
$badZip = Join-Path $archiveRoot "tampered CONTAM tools.zip"
$stdoutPath = Join-Path $caseRoot "redirected stdout.log"
$stderrPath = Join-Path $caseRoot "redirected stderr.log"
$originalRunnerTemp = $env:RUNNER_TEMP

New-Item -ItemType Directory -Force -Path $payloadRoot | Out-Null
try {
    Set-Content -LiteralPath (Join-Path $payloadRoot "tampered.txt") -Value "not official NIST content" -Encoding UTF8
    Compress-Archive -LiteralPath (Join-Path $payloadRoot "tampered.txt") -DestinationPath $badZip
    $env:RUNNER_TEMP = $runnerTemp

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Quote-ProcessArgument (Join-Path $repo "scripts\build-contam-tools.ps1")),
        "-ApprovedTempRoot", (Quote-ProcessArgument $runnerTemp),
        "-SkipDownload",
        "-ZipPath", (Quote-ProcessArgument $badZip)
    )
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw -Encoding UTF8 } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw -Encoding UTF8 } else { "" }
    $combined = $stdout + "`n" + $stderr

    if ($process.ExitCode -eq 0) { throw "Redirected tampered ZIP process unexpectedly succeeded." }
    if ($combined -notmatch "SHA-256 mismatch") { throw "Redirected tampered ZIP failure did not identify the SHA-256 mismatch." }
    if ($combined -match "Get-FileHash.+not recognized|Get-FileHash.+无法识别") { throw "Redirected process regressed to Get-FileHash module auto-loading." }

    $destination = Join-Path $runnerTemp "CONTAM Studio\contam-tools"
    $extractedFiles = @(Get-ChildItem -LiteralPath (Join-Path $destination "extracted") -Recurse -File -ErrorAction SilentlyContinue)
    if ($extractedFiles.Count -ne 0) { throw "Redirected tampered ZIP created extracted files before the hash gate." }
    if (-not (Test-ContamPathWithinRoot $destination $runnerTemp)) { throw "RUNNER_TEMP resolution escaped the redirected test root." }

    Write-Output "Redirected CONTAM tools contract passed: hidden child process, redirected logs, spaced paths, RUNNER_TEMP and pre-extraction SHA-256 failure are stable."
}
finally {
    if ($null -eq $originalRunnerTemp) { Remove-Item Env:RUNNER_TEMP -ErrorAction SilentlyContinue } else { $env:RUNNER_TEMP = $originalRunnerTemp }
    if (Test-Path -LiteralPath $caseRoot) { Remove-Item -LiteralPath $caseRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
