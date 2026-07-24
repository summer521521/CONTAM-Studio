[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$WorkflowPath = "",
    [string]$ConfigRoot = "",
    [string]$ResolvedStorePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
else {
    $Root = (Resolve-Path $Root).Path
}
if ([string]::IsNullOrWhiteSpace($WorkflowPath)) {
    $WorkflowPath = Join-Path $Root ".github\workflows\windows-ci.yml"
}
if ([string]::IsNullOrWhiteSpace($ConfigRoot)) {
    $ConfigRoot = $Root
}
else {
    $ConfigRoot = (Resolve-Path $ConfigRoot).Path
}

$failures = [System.Collections.Generic.List[string]]::new()
function Fail-Cache {
    param([string]$Class, [string]$Message)
    $failures.Add("[${Class}] ${Message}")
}

function Get-WorkflowLines {
    param([string]$Path)
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($rawLine in @(Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $line = ([regex]::Replace($rawLine, '\s+#.*$', '')).Trim()
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $lines.Add($line)
        }
    }
    return @($lines)
}

foreach ($configName in @(".npmrc", "pnpm-workspace.yaml")) {
    $configPath = Join-Path $ConfigRoot $configName
    if (-not (Test-Path -LiteralPath $configPath)) {
        continue
    }
    $item = Get-Item -LiteralPath $configPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Fail-Cache "cache_workspace_config" "${configName} must not be a reparse point."
        continue
    }
    $meaningful = @(
        Get-Content -LiteralPath $configPath -Encoding UTF8 |
            ForEach-Object { ([regex]::Replace($_, '\s+#.*$', '')).Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if ($meaningful.Count -gt 0) {
        Fail-Cache "cache_workspace_config" "${configName} is not allowed until its pnpm semantics are explicitly contracted."
    }
}

if ([string]::IsNullOrWhiteSpace($ResolvedStorePath)) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $storeOutput = @(& pnpm store path --silent 2>&1)
        $storeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($storeExitCode -ne 0 -or $storeOutput.Count -ne 1) {
        Fail-Cache "cache_resolved_path" "pnpm store path --silent must return exactly one path."
    }
    else {
        $ResolvedStorePath = $storeOutput[0].ToString().Trim()
    }
}
if (-not [string]::IsNullOrWhiteSpace($ResolvedStorePath)) {
    try {
        $fullStore = [System.IO.Path]::GetFullPath($ResolvedStorePath).TrimEnd("\\")
        $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\\")
        $insideRoot = $fullStore.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
            $fullStore.StartsWith($fullRoot + "\\", [System.StringComparison]::OrdinalIgnoreCase)
        $nodeModules = $fullStore -match '(?i)(?:^|\\)node_modules(?:\\|$)'
        if ($insideRoot -or $nodeModules) {
            Fail-Cache "cache_resolved_path" "Resolved pnpm store must be outside the workspace and node_modules."
        }
    }
    catch {
        Fail-Cache "cache_resolved_path" "Resolved pnpm store path is invalid."
    }
}

if (-not (Test-Path -LiteralPath $WorkflowPath -PathType Leaf)) {
    Fail-Cache "cache_workflow_contract" "Workflow file is missing."
}
else {
    $workflowLines = @(Get-WorkflowLines $WorkflowPath)
    $producers = @($workflowLines | Where-Object { $_ -match '\bpnpm\s+store\s+path\s+--silent\b' })
    if ($producers.Count -ne 1) {
        $class = if ($producers.Count -gt 1) { "cache_duplicate_producer" } else { "cache_producer" }
        Fail-Cache $class "Expected exactly one pnpm store path producer; got $($producers.Count)."
    }
    $consumer = '${{ steps.pnpm_store.outputs.store-path }}'
    $consumers = @($workflowLines | Where-Object { $_ -eq "path: ${consumer}" })
    if ($consumers.Count -ne 1) {
        Fail-Cache "cache_consumer" "Expected exactly one cache consumer bound to the pnpm store producer."
    }
}

if ($failures.Count -eq 0) {
    $workflowChecker = Join-Path $PSScriptRoot "test-windows-ci-contract.ps1"
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $workflowOutput = @(& powershell.exe -NoProfile -File $workflowChecker -Root $Root -WorkflowPath $WorkflowPath 2>&1)
        $workflowExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($workflowExitCode -ne 0) {
        Fail-Cache "cache_workflow_contract" "Restricted Windows CI workflow contract failed: $($workflowOutput -join ' ')"
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host "pnpm cache contract passed: one producer, one consumer, no workspace redirect, and an external resolved store."
