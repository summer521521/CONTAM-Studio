[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "../..")).Path
$TempRoot = Join-Path "F:\Codex_File\temp" ("qa-01a-python-origin-test-" + [guid]::NewGuid().ToString("N"))
$FakePackageRoot = Join-Path $TempRoot "fake-python-src"
$FakePackage = Join-Path $FakePackageRoot "contam_studio_core"
$VerifyScript = Join-Path $Root "scripts\verify.ps1"
$HadPythonPath = Test-Path Env:PYTHONPATH
$PreviousPythonPath = $env:PYTHONPATH

try {
    New-Item -ItemType Directory -Path $FakePackage -Force | Out-Null
    [System.IO.File]::WriteAllText(
        (Join-Path $FakePackage "__init__.py"),
        "__version__ = 'qa-01a-origin-test'`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    $env:PYTHONPATH = $FakePackageRoot
    $output = @(powershell.exe -NoProfile -File $VerifyScript -Mode Fast 2>&1)
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"

    if ($exitCode -eq 0) {
        throw "Expected Fast verification to reject the external package origin."
    }
    if ($text -notmatch "Python package origin") {
        throw "Origin failure diagnostic was not reported."
    }
    if ($text -notmatch "<outside-clone>") {
        throw "Origin failure did not use the safe relative diagnostic."
    }
    if ($text -match [regex]::Escape($FakePackageRoot)) {
        throw "Origin failure leaked the external absolute path."
    }
    if ($text -match "\[RUN \] Python pytest") {
        throw "Fast checks continued after the origin gate failed."
    }

    Write-Host "QA-01A origin negative test passed."
}
finally {
    if ($HadPythonPath) {
        $env:PYTHONPATH = $PreviousPythonPath
    }
    else {
        Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force
    }
}
