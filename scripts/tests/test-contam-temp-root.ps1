[CmdletBinding()]
param(
    [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repo = if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
} else {
    (Resolve-Path $RepoRoot).Path
}
. (Join-Path $repo "scripts\lib\contam-temp-root.ps1")

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("contam-studio-temp-root-" + [Guid]::NewGuid().ToString("N"))
$originalRunnerTemp = $env:RUNNER_TEMP
$originalLocalCodexProbe = ${function:Test-ContamLocalCodexRoot}
try {
    $env:RUNNER_TEMP = Join-Path $fixtureRoot "runner-temp"
    $runnerResolved = Resolve-ContamTempRoot
    if (-not $runnerResolved.Equals((Resolve-ContamAbsolutePath (Join-Path $env:RUNNER_TEMP "CONTAM Studio")), [StringComparison]::OrdinalIgnoreCase)) {
        throw "RUNNER_TEMP resolution did not use its dedicated CONTAM Studio directory."
    }

    $explicitResolved = Resolve-ContamTempRoot $fixtureRoot
    if (-not $explicitResolved.Equals((Resolve-ContamAbsolutePath $fixtureRoot), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Explicit temp-root resolution did not preserve the caller path."
    }
    if (-not (Test-ContamPathWithinRoot (Join-Path $fixtureRoot "child") $fixtureRoot)) {
        throw "Path boundary accepted a valid child incorrectly."
    }
    if (Test-ContamPathWithinRoot (Join-Path (Split-Path -Parent $fixtureRoot) "sibling") $fixtureRoot) {
        throw "Path boundary accepted a sibling escape."
    }

    $env:RUNNER_TEMP = ""
    Set-Item -LiteralPath Function:\Test-ContamLocalCodexRoot -Value { param([string]$Path) return $false }
    $fallbackResolved = Resolve-ContamTempRoot
    $expectedFallback = Resolve-ContamAbsolutePath (Join-Path ([IO.Path]::GetTempPath()) "CONTAM Studio")
    if (-not $fallbackResolved.Equals($expectedFallback, [StringComparison]::OrdinalIgnoreCase)) {
        throw "No-F-drive fallback did not select the dedicated system temporary directory."
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\tests\test-contam-tools-script.ps1") -TaskRoot (Join-Path $fixtureRoot "tool-script")
    if ($LASTEXITCODE -ne 0) { throw "Contam tools script did not pass with an explicit system-temp fixture root." }
    Write-Output "Contam temp-root contract passed: explicit, RUNNER_TEMP, fallback and boundary paths are portable."
}
finally {
    Set-Item -LiteralPath Function:\Test-ContamLocalCodexRoot -Value $originalLocalCodexProbe
    if ($null -eq $originalRunnerTemp) { Remove-Item Env:RUNNER_TEMP -ErrorAction SilentlyContinue } else { $env:RUNNER_TEMP = $originalRunnerTemp }
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
