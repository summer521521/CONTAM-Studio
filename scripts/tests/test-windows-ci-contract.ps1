[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$WorkflowPath = "",
    [string]$BaselinePath = ""
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
if ([string]::IsNullOrWhiteSpace($BaselinePath)) {
    $BaselinePath = Join-Path $Root "docs\development\toolchain-baseline.json"
}

$Failures = New-Object System.Collections.Generic.List[string]
$Passed = New-Object System.Collections.Generic.List[string]

function Fail-Contract {
    param([string]$Message)
    $Failures.Add($Message)
}

function Pass-Contract {
    param([string]$Message)
    $Passed.Add($Message)
}

function Assert-Contains {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Message
    )

    if ($Text -notmatch $Pattern) {
        Fail-Contract $Message
    }
}

if (-not (Test-Path -LiteralPath $WorkflowPath -PathType Leaf)) {
    Fail-Contract "workflow file is missing"
}
if (-not (Test-Path -LiteralPath $BaselinePath -PathType Leaf)) {
    Fail-Contract "toolchain baseline is missing"
}

if ($Failures.Count -eq 0) {
    $workflow = Get-Content -LiteralPath $WorkflowPath -Raw -Encoding UTF8
    $workflowLines = @($workflow -split "\r?\n")
    Assert-Contains $workflow '(?m)^name:\s*Windows CI\s*$' "workflow name must be Windows CI"
    Assert-Contains $workflow '(?m)^\s+full:\s*$' "full job id is missing"
    Assert-Contains $workflow '(?m)^\s+name:\s*Full verification\s*$' "Full verification job name is missing"
    Assert-Contains $workflow '(?m)^\s+runs-on:\s*windows-2022\s*$' "runner must be windows-2022"
    Assert-Contains $workflow '(?m)^\s+timeout-minutes:\s*60\s*$' "timeout must be 60 minutes"
    Assert-Contains $workflow '(?m)^\s+cancel-in-progress:\s*true\s*$' "old runs must be cancelled"
    Assert-Contains $workflow '(?m)^\s+persist-credentials:\s*false\s*$' "checkout credentials must not persist"

    $onMatch = [regex]::Match($workflow, '(?ms)^on:\s*\r?\n(?<body>.*?)(?=^permissions:)')
    if (-not $onMatch.Success) {
        Fail-Contract "workflow trigger block is missing"
    }
    else {
        $onBody = $onMatch.Groups["body"].Value
        $events = @([regex]::Matches($onBody, '(?m)^  (?<event>[A-Za-z_]+):\s*$') | ForEach-Object { $_.Groups["event"].Value })
        $actualEvents = (@($events | Sort-Object) -join ",")
        $expectedEvents = (@("pull_request", "push", "workflow_dispatch" | Sort-Object) -join ",")
        if ($actualEvents -ne $expectedEvents) {
            Fail-Contract "workflow triggers must be pull_request, push and workflow_dispatch only"
        }
        Assert-Contains $onBody '(?ms)^  pull_request:\s*\r?\n    branches:\s*\r?\n      - main\s*$' "pull_request must target main"
        Assert-Contains $onBody '(?ms)^  push:\s*\r?\n    branches:\s*\r?\n      - main\s*$' "push must target main"
        if ($onBody -match '(?m)^\s+paths(-ignore)?:') {
            Fail-Contract "workflow must not use paths filters"
        }
    }

    $permissionMatch = [regex]::Match($workflow, '(?ms)^permissions:\s*\r?\n(?<body>.*?)(?=^concurrency:)')
    if (-not $permissionMatch.Success) {
        Fail-Contract "permissions block is missing"
    }
    else {
        $permissionLines = @($permissionMatch.Groups["body"].Value -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ((@($permissionLines) -join ",") -ne "contents: read") {
            Fail-Contract "permissions must be exactly contents: read"
        }
    }

    $expectedPins = @(
        "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
        "pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288",
        "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
        "actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1",
        "dtolnay/rust-toolchain@2c7215f132e9ebf062739d9130488b56d53c060c",
        "actions/cache@caa296126883cff596d87d8935842f9db880ef25"
    )
    $actualPins = @($workflowLines | ForEach-Object {
        if ($_ -match '^\s+uses:\s*(?<action>[^@\s]+)@(?<ref>[^\s]+)\s*$') {
            "$($Matches.action)@$($Matches.ref)"
        }
    })
    foreach ($pin in $expectedPins) {
        if (@($actualPins | Where-Object { $_ -eq $pin }).Count -eq 0) {
            Fail-Contract "missing exact Action pin ${pin}"
        }
    }
    if (@($actualPins | Where-Object { $_ -match '@[^0-9a-f]{40}$' }).Count -gt 0) {
        Fail-Contract "all Action references must be full SHA-1 values"
    }
    if (@($actualPins | Where-Object { $_ -like "actions/cache@*" }).Count -ne 3) {
        Fail-Contract "actions/cache must be used for exactly three bounded caches"
    }

    Assert-Contains $workflow '(?m)^\s+python-version:\s*3\.12\.10\s*$' "Python version must be 3.12.10"
    Assert-Contains $workflow '(?m)^\s+version:\s*11\.14\.0\s*$' "pnpm version must be 11.14.0"
    Assert-Contains $workflow '(?m)^\s+node-version:\s*24\.13\.0\s*$' "Node version must be 24.13.0"
    Assert-Contains $workflow '(?m)^\s+toolchain:\s*1\.97\.1-x86_64-pc-windows-msvc\s*$' "Rust toolchain must be exact MSVC 1.97.1"
    Assert-Contains $workflow '(?m)python\\requirements-ci\.lock' "Python CI lock must be installed"
    Assert-Contains $workflow '(?m)--require-hashes' "Python install must require hashes"
    Assert-Contains $workflow '(?m)--only-binary\s+:all:' "Python install must be binary-only"
    Assert-Contains $workflow '(?m)pnpm install --frozen-lockfile' "pnpm must use the frozen lockfile"
    Assert-Contains $workflow '(?m)powershell\.exe -NoProfile -File scripts\\verify\.ps1 -Mode Full' "Full must use the unified verify entry"
    if (@([regex]::Matches($workflow, 'powershell\.exe -NoProfile -File scripts\\verify\.ps1 -Mode Full')).Count -ne 1) {
        Fail-Contract "Full verification entry must appear exactly once"
    }
    if ($workflow -match '(?im)pull_request_target|secrets\.|\bwrite\b|continue-on-error|\brelease\b|\bartifact\b|codex|contamx') {
        Fail-Contract "workflow contains a forbidden trigger, privilege, release, artifact or real-tool reference"
    }
    if ($workflow -match '(?m)^\s*path:.*(python\\\.venv|node_modules|src-tauri\\target|github\.workspace)') {
        Fail-Contract "cache path includes a forbidden workspace or build directory"
    }
}

if ($Failures.Count -eq 0) {
    try {
        $baseline = Get-Content -LiteralPath $BaselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $expectedLocks = @("pnpm-lock.yaml", "src-tauri/Cargo.lock", "python/requirements-ci.lock")
        $actualLocks = @([string[]]$baseline.lock_files)
        if ((@($actualLocks | Sort-Object) -join ",") -ne (@($expectedLocks | Sort-Object) -join ",")) {
            Fail-Contract "baseline must list exactly the three CI lock files"
        }
        foreach ($lock in $expectedLocks) {
            $tracked = @(git -C $Root ls-files --error-unmatch -- $lock 2>$null)
            if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne 1) {
                Fail-Contract "lock file ${lock} must be tracked"
            }
        }
    }
    catch {
        Fail-Contract "baseline JSON could not be validated"
    }
}

if ($Failures.Count -eq 0) {
    Pass-Contract "Windows CI contract"
    Write-Output "Windows CI contract passed."
    exit 0
}

Write-Error ("Windows CI contract failed: " + ($Failures -join "; "))
exit 1
