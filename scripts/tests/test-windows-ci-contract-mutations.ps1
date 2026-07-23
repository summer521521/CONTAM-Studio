Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checker = Join-Path $PSScriptRoot "test-windows-ci-contract.ps1"
$workflowPath = Join-Path $root ".github\workflows\windows-ci.yml"
$baselinePath = Join-Path $root "docs\development\toolchain-baseline.json"
$source = Get-Content -LiteralPath $workflowPath -Raw -Encoding UTF8
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("contam-workflow-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-Checker {
    param([string]$Path)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& powershell.exe -NoProfile -File $checker -Root $root -WorkflowPath $Path -BaselinePath $baselinePath 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join "`n") }
}

function Invoke-Mutation {
    param([string]$Name, [string]$Content, [string]$ExpectedDiagnostic)
    $path = Join-Path $tempRoot "${Name}.yml"
    [System.IO.File]::WriteAllText($path, $Content, [System.Text.UTF8Encoding]::new($false))
    $result = Invoke-Checker $path
    if ($result.ExitCode -eq 0) {
        throw "Mutation '${Name}' unexpectedly passed."
    }
    if ($result.Output -notmatch [regex]::Escape($ExpectedDiagnostic)) {
        throw "Mutation '${Name}' failed without ${ExpectedDiagnostic}; output=$($result.Output)"
    }
}

try {
    $positive = Invoke-Checker $workflowPath
    if ($positive.ExitCode -ne 0) {
        throw "Tracked bare-uses workflow failed: $($positive.Output)"
    }

    $checkout = "uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"
    Invoke-Mutation "quoted-uses-key" ($source.Replace($checkout, "'uses': actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803")) "workflow_uses_syntax"
    Invoke-Mutation "quoted-uses-value" ($source.Replace($checkout, 'uses: "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"')) "workflow_uses_syntax"
    Invoke-Mutation "anchored-uses" ($source.Replace($checkout, "uses: &checkout actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803")) "workflow_yaml_feature"
    Invoke-Mutation "aliased-uses" ($source.Replace($checkout, "uses: *checkout")) "workflow_yaml_feature"
    Invoke-Mutation "commented-uses" ($source.Replace("        ${checkout}", "        # ${checkout}")) "workflow_step_contract"
    Invoke-Mutation "malformed-uses" ($source.Replace($checkout, "uses : actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803")) "workflow_uses_syntax"
    Invoke-Mutation "hidden-mutable-ref" ($source.Replace($checkout, "uses: actions/checkout@main # d23441a48e516b6c34aea4fa41551a30e30af803")) "workflow_mutable_ref"
    Invoke-Mutation "fake-full-comment" ($source.Replace("        run: powershell.exe -NoProfile -File scripts\verify.ps1 -Mode Full", "        run: echo skipped`r`n        # powershell.exe -NoProfile -File scripts\verify.ps1 -Mode Full")) "workflow_full_command"
    Invoke-Mutation "permission-drift" ($source.Replace("  contents: read", "  contents: write")) "workflow_permissions"
    Invoke-Mutation "action-drift" ($source.Replace($checkout, "uses: actions/checkout@023441a48e516b6c34aea4fa41551a30e30af803")) "workflow_action_drift"
    Invoke-Mutation "runner-drift" ($source.Replace("    runs-on: windows-2022", "    runs-on: windows-latest")) "workflow_runner_drift"
    Invoke-Mutation "timeout-drift" ($source.Replace("    timeout-minutes: 60", "    timeout-minutes: 30")) "workflow_timeout_drift"
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Windows CI contract mutation tests passed: 12 syntax, pin, command, permission, runner, and timeout mutations were rejected."
