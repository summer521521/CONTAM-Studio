Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checker = Join-Path $PSScriptRoot "test-pnpm-cache-contract.ps1"
$workflow = Get-Content -LiteralPath (Join-Path $root ".github\workflows\windows-ci.yml") -Raw -Encoding UTF8
$tempRoot = Join-Path "F:\Codex_File\temp\contam-studio" ("fnd-04-pnpm-cache-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-ExpectedFailure {
    param([string]$Name, [string]$Workflow, [string]$ConfigName, [string]$ConfigContent, [string]$StorePath, [string]$Diagnostic)
    $caseRoot = Join-Path $tempRoot $Name
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    $workflowPath = Join-Path $caseRoot "windows-ci.yml"
    [System.IO.File]::WriteAllText($workflowPath, $Workflow, [System.Text.UTF8Encoding]::new($false))
    if (-not [string]::IsNullOrWhiteSpace($ConfigName)) {
        [System.IO.File]::WriteAllText((Join-Path $caseRoot $ConfigName), $ConfigContent, [System.Text.UTF8Encoding]::new($false))
    }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& powershell.exe -NoProfile -File $checker -Root $root -WorkflowPath $workflowPath -ConfigRoot $caseRoot -ResolvedStorePath $StorePath 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message }
                else { [string]$_ }
            })
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -eq 0) {
        throw "Mutation '${Name}' unexpectedly passed."
    }
    $diagnosticText = (($output -join "`n") -replace "\s+", "")
    if ($diagnosticText -notmatch [regex]::Escape(($Diagnostic -replace "\s+", ""))) {
        throw "Mutation '${Name}' failed without ${Diagnostic}; output=$($output -join ' | ')"
    }
}

try {
    $safeStore = "F:\Codex_File\cache\contract-pnpm-store"
    Invoke-ExpectedFailure "store-dir" $workflow ".npmrc" "store-dir=.pnpm-store" $safeStore "cache_workspace_config"
    Invoke-ExpectedFailure "storeDir" $workflow ".npmrc" "storeDir=.pnpm-store" $safeStore "cache_workspace_config"
    Invoke-ExpectedFailure "node-modules" $workflow ".npmrc" "modules-dir=node_modules" $safeStore "cache_workspace_config"
    Invoke-ExpectedFailure "workspace-yaml" $workflow "pnpm-workspace.yaml" "packages:`n  - node_modules" $safeStore "cache_workspace_config"
    Invoke-ExpectedFailure "resolved-under-node-modules" $workflow "" "" (Join-Path $root "node_modules\.pnpm-store") "cache_resolved_path"
    $producerLine = '          "store-path=$(pnpm store path --silent)" >> $env:GITHUB_OUTPUT'
    Invoke-ExpectedFailure "duplicate-producer" ($workflow.Replace($producerLine, "${producerLine}`r`n          pnpm store path --silent")) "" "" $safeStore "cache_duplicate_producer"
    Invoke-ExpectedFailure "redirected-consumer" ($workflow.Replace('${{ steps.pnpm_store.outputs.store-path }}', 'node_modules\.pnpm-store')) "" "" $safeStore "cache_consumer"
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "pnpm cache contract mutation tests passed: workspace redirects, resolved-store redirection, duplicate producers, and consumer drift were rejected."
