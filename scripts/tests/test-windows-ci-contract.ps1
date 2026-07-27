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

$failures = [System.Collections.Generic.List[string]]::new()

function Fail-Contract {
    param([string]$Class, [string]$Message)
    $failures.Add("[${Class}] ${Message}")
}

function Remove-InlineComment {
    param([string]$Text)
    return ([regex]::Replace($Text, '\s+#.*$', '')).TrimEnd()
}

function Parse-RestrictedWorkflow {
    param([string]$Path)
    $tokens = [System.Collections.Generic.List[object]]::new()
    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
    $activeBlock = $null

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $lineNumber = $index + 1
        $line = [string]$lines[$index]
        if ($line.Contains("`t")) {
            Fail-Contract "workflow_yaml_syntax" "Tabs are not supported at line ${lineNumber}."
            continue
        }
        $indent = $line.Length - $line.TrimStart(" ").Length
        if ($null -ne $activeBlock -and $indent -gt $activeBlock.Indent) {
            $contentStart = [Math]::Min($line.Length, $activeBlock.Indent + 2)
            $activeBlock.BlockLines.Add($line.Substring($contentStart).TrimEnd())
            continue
        }
        $activeBlock = $null
        $content = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($content) -or $content.StartsWith("#")) {
            continue
        }
        if (($indent % 2) -ne 0) {
            Fail-Contract "workflow_yaml_syntax" "Indentation must use multiples of two spaces at line ${lineNumber}."
            continue
        }
        $content = Remove-InlineComment $line.Substring($indent)
        if ([string]::IsNullOrWhiteSpace($content)) {
            continue
        }
        if ($content -in @("---", "...") -or $content -match '^(?:\{|\[|<<:)') {
            Fail-Contract "workflow_yaml_feature" "Document, flow, and merge-key syntax is unsupported at line ${lineNumber}."
            continue
        }
        if ($content -match '^(?:-|\s)*(?:["'']uses["'']|uses\s+):') {
            Fail-Contract "workflow_uses_syntax" "The uses key must be the exact bare token 'uses:' at line ${lineNumber}."
            continue
        }

        $kind = ""
        $key = ""
        $value = ""
        if ($content -match '^-[ ](?<key>[A-Za-z_][A-Za-z0-9_-]*):(?:[ ](?<value>.*))?$') {
            $kind = "ListMapping"
            $key = $Matches.key
            $value = [string]$Matches["value"]
        }
        elseif ($content -match '^-[ ](?<value>.+)$') {
            $kind = "ListScalar"
            $value = [string]$Matches.value
        }
        elseif ($content -match '^(?<key>[A-Za-z_][A-Za-z0-9_-]*):(?:[ ](?<value>.*))?$') {
            $kind = "Mapping"
            $key = $Matches.key
            $value = [string]$Matches["value"]
        }
        else {
            Fail-Contract "workflow_yaml_syntax" "Unsupported YAML syntax at line ${lineNumber}."
            continue
        }
        if ($key -eq "uses" -and ($value.StartsWith("'") -or $value.StartsWith('"'))) {
            Fail-Contract "workflow_uses_syntax" "Quoted uses values are unsupported at line ${lineNumber}."
            continue
        }
        if ($value -match '^(?:&|\*|!)[^\s]+') {
            Fail-Contract "workflow_yaml_feature" "Anchors, aliases, and tags are unsupported at line ${lineNumber}."
            continue
        }
        if (($value.StartsWith("'") -and $value.EndsWith("'")) -or ($value.StartsWith('"') -and $value.EndsWith('"'))) {
            Fail-Contract "workflow_yaml_feature" "Quoted scalars are outside the restricted workflow grammar at line ${lineNumber}."
            continue
        }
        if ($value -match '^[\[\{]' -and -not $value.StartsWith('${{')) {
            Fail-Contract "workflow_yaml_feature" "Flow collections are unsupported at line ${lineNumber}."
            continue
        }
        if ($value -eq ">" -or $value -match '^[|>][+-]?$' -and $value -ne "|") {
            Fail-Contract "workflow_yaml_feature" "Only literal block scalar '|' is supported at line ${lineNumber}."
            continue
        }

        $token = [pscustomobject]@{
            Line = $lineNumber
            Indent = $indent
            Kind = $kind
            Key = $key
            Value = $value
            BlockLines = [System.Collections.Generic.List[string]]::new()
        }
        $tokens.Add($token)
        if ($value -eq "|") {
            $activeBlock = $token
        }
    }
    return @($tokens)
}

function Assert-Labels {
    param([object[]]$Tokens, [string[]]$Expected, [string]$Class, [string]$Context)
    $actual = @($Tokens | ForEach-Object {
        if ($_.Kind -eq "ListMapping") { "-$($_.Key)" }
        elseif ($_.Kind -eq "ListScalar") { "-=$($_.Value)" }
        else { [string]$_.Key }
    })
    if (($actual -join "|") -ne ($Expected -join "|")) {
        Fail-Contract $Class "${Context} must be exactly [$($Expected -join ', ')]; got [$($actual -join ', ')]."
    }
}

function Get-UniqueToken {
    param(
        [object[]]$Tokens,
        [int]$Indent,
        [string]$Key,
        [int]$StartLine,
        [int]$EndLine,
        [string]$Class,
        [string]$Context
    )
    $matches = @($Tokens | Where-Object {
        $_.Indent -eq $Indent -and $_.Kind -eq "Mapping" -and $_.Key -eq $Key -and
        $_.Line -ge $StartLine -and $_.Line -lt $EndLine
    })
    if ($matches.Count -ne 1) {
        Fail-Contract $Class "${Context} requires exactly one '${Key}' key."
        return $null
    }
    return $matches[0]
}

function Assert-ScalarValue {
    param($Token, [string]$Expected, [string]$Class, [string]$Context)
    if ($null -eq $Token -or $Token.Value -ne $Expected -or $Token.BlockLines.Count -ne 0) {
        Fail-Contract $Class "${Context} must equal '${Expected}'."
    }
}

function Convert-StepContract {
    param([object[]]$Tokens, $StartToken, [int]$EndLine)
    $properties = [ordered]@{}
    $with = [ordered]@{}
    foreach ($token in @($Tokens | Where-Object { $_.Line -gt $StartToken.Line -and $_.Line -lt $EndLine })) {
        if ($token.Indent -eq 8 -and $token.Kind -eq "Mapping") {
            if ($properties.Contains($token.Key)) {
                Fail-Contract "workflow_step_contract" "Step '$($StartToken.Value)' duplicates '$($token.Key)'."
                continue
            }
            $properties[$token.Key] = if ($token.Value -eq "|") { @($token.BlockLines) } else { $token.Value }
        }
        elseif ($token.Indent -eq 10 -and $token.Kind -eq "Mapping" -and $properties.Contains("with")) {
            if ($with.Contains($token.Key)) {
                Fail-Contract "workflow_step_contract" "Step '$($StartToken.Value)' duplicates with.$($token.Key)."
                continue
            }
            $with[$token.Key] = if ($token.Value -eq "|") { @($token.BlockLines) } else { $token.Value }
        }
        else {
            Fail-Contract "workflow_step_contract" "Step '$($StartToken.Value)' contains unsupported nesting at line $($token.Line)."
        }
    }
    if ($properties.Contains("with")) {
        if ([string]$properties["with"] -ne "") {
            Fail-Contract "workflow_step_contract" "Step '$($StartToken.Value)' must use a mapping for with."
        }
        $properties["with"] = $with
    }
    return [ordered]@{ name = $StartToken.Value; properties = $properties }
}

function New-ExpectedStepContracts {
    $checkout = "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"
    $python = "actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1"
    $pnpm = "pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288"
    $node = "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38"
    $rust = "dtolnay/rust-toolchain@2c7215f132e9ebf062739d9130488b56d53c060c"
    $cache = "actions/cache@caa296126883cff596d87d8935842f9db880ef25"
    return @(
        [ordered]@{ name = "Checkout"; properties = [ordered]@{ uses = $checkout; with = [ordered]@{ "fetch-depth" = "0"; "persist-credentials" = "false" } } },
        [ordered]@{ name = "Set up Python"; properties = [ordered]@{ uses = $python; with = [ordered]@{ "python-version" = "3.12.10"; architecture = "x64" } } },
        [ordered]@{ name = "Set up pnpm"; properties = [ordered]@{ uses = $pnpm; with = [ordered]@{ version = "11.14.0" } } },
        [ordered]@{ name = "Set up Node.js"; properties = [ordered]@{ uses = $node; with = [ordered]@{ "node-version" = "24.13.0" } } },
        [ordered]@{ name = "Set up Rust"; properties = [ordered]@{ uses = $rust; with = [ordered]@{ toolchain = "1.97.1-x86_64-pc-windows-msvc"; components = "rustfmt, clippy" } } },
        [ordered]@{ name = "Resolve pnpm store"; properties = [ordered]@{ id = "pnpm_store"; shell = "pwsh"; run = '"store-path=$(pnpm store path --silent)" >> $env:GITHUB_OUTPUT' } },
        [ordered]@{ name = "Cache pnpm downloads"; properties = [ordered]@{ uses = $cache; with = [ordered]@{ path = '${{ steps.pnpm_store.outputs.store-path }}'; key = 'windows-pnpm-${{ hashFiles(''pnpm-lock.yaml'') }}' } } },
        [ordered]@{ name = "Cache pip downloads"; properties = [ordered]@{ uses = $cache; with = [ordered]@{ path = '${{ runner.temp }}\pip-cache'; key = 'windows-pip-${{ hashFiles(''python/requirements-ci.lock'') }}' } } },
        [ordered]@{ name = "Cache Cargo registry and git"; properties = [ordered]@{ uses = $cache; with = [ordered]@{ path = @('~\.cargo\registry', '~\.cargo\git'); key = 'windows-cargo-${{ hashFiles(''src-tauri/Cargo.lock'') }}' } } },
        [ordered]@{ name = "Create project Python environment"; properties = [ordered]@{ shell = "pwsh"; run = @("`$env:PIP_CACHE_DIR = Join-Path `$env:RUNNER_TEMP 'pip-cache'", 'python -m venv python\.venv', 'python\.venv\Scripts\python.exe -m pip install --require-hashes --only-binary :all: -r python\requirements-ci.lock', '$site = python\.venv\Scripts\python.exe -c "import sysconfig; print(sysconfig.get_path(''purelib''))"', "Set-Content -LiteralPath (Join-Path `$site 'contam_studio_core_checkout.pth') -Value ((Resolve-Path 'python\src').Path) -Encoding ASCII") } },
        [ordered]@{ name = "Install frontend dependencies"; properties = [ordered]@{ run = "pnpm install --frozen-lockfile --ignore-scripts" } },
        [ordered]@{ name = "Full verification"; properties = [ordered]@{ shell = "pwsh"; run = "powershell.exe -NoProfile -File scripts\verify.ps1 -Mode Full" } }
    )
}

if (-not (Test-Path -LiteralPath $WorkflowPath -PathType Leaf)) {
    Fail-Contract "workflow_missing" "Workflow file is missing."
}
if (-not (Test-Path -LiteralPath $BaselinePath -PathType Leaf)) {
    Fail-Contract "baseline_missing" "Toolchain baseline is missing."
}

$tokens = @()
if ($failures.Count -eq 0) {
    $tokens = @(Parse-RestrictedWorkflow $WorkflowPath)
}

if ($failures.Count -eq 0) {
    $maxLine = if ($tokens.Count -gt 0) { ($tokens | Measure-Object Line -Maximum).Maximum + 1 } else { 1 }
    $top = @($tokens | Where-Object { $_.Indent -eq 0 })
    Assert-Labels $top @("name", "on", "permissions", "concurrency", "jobs") "workflow_structure" "Top-level keys"
    $topByKey = @{}
    foreach ($token in $top) {
        if ($topByKey.ContainsKey($token.Key)) {
            Fail-Contract "workflow_structure" "Top-level key '$($token.Key)' is duplicated."
        }
        else {
            $topByKey[$token.Key] = $token
        }
    }
    if ($failures.Count -eq 0) {
        Assert-ScalarValue $topByKey.name "Windows CI" "workflow_name" "Workflow name"
        Assert-ScalarValue $topByKey.on "" "workflow_trigger" "Trigger container"
        Assert-ScalarValue $topByKey.permissions "" "workflow_permissions" "Permissions container"
        Assert-ScalarValue $topByKey.concurrency "" "workflow_concurrency" "Concurrency container"
        Assert-ScalarValue $topByKey.jobs "" "workflow_structure" "Jobs container"

        $onTokens = @($tokens | Where-Object { $_.Line -gt $topByKey.on.Line -and $_.Line -lt $topByKey.permissions.Line -and $_.Indent -eq 2 })
        Assert-Labels $onTokens @("pull_request", "push", "workflow_dispatch") "workflow_trigger" "Trigger events"
        foreach ($eventName in @("pull_request", "push")) {
            $event = @($onTokens | Where-Object Key -eq $eventName)[0]
            $nextEventLine = @($onTokens | Where-Object { $_.Line -gt $event.Line } | Select-Object -First 1).Line
            if ($null -eq $nextEventLine) { $nextEventLine = $topByKey.permissions.Line }
            $eventChildren = @($tokens | Where-Object { $_.Line -gt $event.Line -and $_.Line -lt $nextEventLine })
            Assert-Labels $eventChildren @("branches", "-=main") "workflow_trigger" "${eventName} contract"
            if ($eventChildren.Count -eq 2 -and ($eventChildren[0].Indent -ne 4 -or $eventChildren[1].Indent -ne 6)) {
                Fail-Contract "workflow_trigger" "${eventName} branch nesting is invalid."
            }
        }

        $permissionTokens = @($tokens | Where-Object { $_.Line -gt $topByKey.permissions.Line -and $_.Line -lt $topByKey.concurrency.Line -and $_.Indent -eq 2 })
        Assert-Labels $permissionTokens @("contents") "workflow_permissions" "Permissions"
        if ($permissionTokens.Count -eq 1) { Assert-ScalarValue $permissionTokens[0] "read" "workflow_permissions" "permissions.contents" }

        $concurrencyTokens = @($tokens | Where-Object { $_.Line -gt $topByKey.concurrency.Line -and $_.Line -lt $topByKey.jobs.Line -and $_.Indent -eq 2 })
        Assert-Labels $concurrencyTokens @("group", "cancel-in-progress") "workflow_concurrency" "Concurrency"
        if ($concurrencyTokens.Count -eq 2) {
            Assert-ScalarValue $concurrencyTokens[0] 'windows-ci-${{ github.workflow }}-${{ github.ref }}' "workflow_concurrency" "concurrency.group"
            Assert-ScalarValue $concurrencyTokens[1] "true" "workflow_concurrency" "concurrency.cancel-in-progress"
        }

        $jobTokens = @($tokens | Where-Object { $_.Line -gt $topByKey.jobs.Line -and $_.Indent -eq 2 })
        Assert-Labels $jobTokens @("full") "workflow_structure" "Jobs"
        if ($jobTokens.Count -eq 1) {
            $fullLine = $jobTokens[0].Line
            $fullProperties = @($tokens | Where-Object { $_.Line -gt $fullLine -and $_.Indent -eq 4 })
            Assert-Labels $fullProperties @("name", "runs-on", "timeout-minutes", "steps") "workflow_job_contract" "Full job keys"
            $jobName = @($fullProperties | Where-Object Key -eq "name")
            $runner = @($fullProperties | Where-Object Key -eq "runs-on")
            $timeout = @($fullProperties | Where-Object Key -eq "timeout-minutes")
            if ($jobName.Count -eq 1) { Assert-ScalarValue $jobName[0] "Full verification" "workflow_job_contract" "Full job name" }
            if ($runner.Count -eq 1) { Assert-ScalarValue $runner[0] "windows-2022" "workflow_runner_drift" "Full runner" }
            if ($timeout.Count -eq 1) { Assert-ScalarValue $timeout[0] "60" "workflow_timeout_drift" "Full timeout" }

            $stepStarts = @($tokens | Where-Object { $_.Line -gt $fullLine -and $_.Indent -eq 6 })
            if (@($stepStarts | Where-Object { $_.Kind -ne "ListMapping" -or $_.Key -ne "name" }).Count -gt 0) {
                Fail-Contract "workflow_step_contract" "Every step must start with '- name:'."
            }
            $expectedSteps = @(New-ExpectedStepContracts)
            $actualSteps = @()
            for ($stepIndex = 0; $stepIndex -lt $stepStarts.Count; $stepIndex++) {
                $endLine = if ($stepIndex + 1 -lt $stepStarts.Count) { $stepStarts[$stepIndex + 1].Line } else { $maxLine }
                $actualSteps += ,(Convert-StepContract $tokens $stepStarts[$stepIndex] $endLine)
            }
            if ($actualSteps.Count -ne $expectedSteps.Count) {
                Fail-Contract "workflow_step_contract" "Expected $($expectedSteps.Count) steps; got $($actualSteps.Count)."
            }

            foreach ($step in $actualSteps) {
                if ($step.properties.Contains("uses")) {
                    $action = [string]$step.properties.uses
                    if ($action -notmatch '^(?<name>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)@(?<ref>[^\s]+)$') {
                        Fail-Contract "workflow_action_syntax" "Step '$($step.name)' has malformed uses syntax."
                    }
                    elseif ($Matches.ref -notmatch '^[0-9a-f]{40}$') {
                        Fail-Contract "workflow_mutable_ref" "Step '$($step.name)' must pin its Action to a lowercase full SHA-1."
                    }
                }
            }
            $comparisonCount = [Math]::Min($actualSteps.Count, $expectedSteps.Count)
            for ($stepIndex = 0; $stepIndex -lt $comparisonCount; $stepIndex++) {
                $actual = $actualSteps[$stepIndex]
                $expected = $expectedSteps[$stepIndex]
                if ($actual.name -ne $expected.name) {
                    Fail-Contract "workflow_step_contract" "Step $stepIndex must be '$($expected.name)'."
                    continue
                }
                if ($actual.properties.Contains("uses") -and $expected.properties.Contains("uses") -and $actual.properties.uses -ne $expected.properties.uses) {
                    Fail-Contract "workflow_action_drift" "Step '$($actual.name)' does not use the approved Action SHA."
                }
                $actualJson = $actual | ConvertTo-Json -Depth 10 -Compress
                $expectedJson = $expected | ConvertTo-Json -Depth 10 -Compress
                if ($actualJson -ne $expectedJson) {
                    $class = if ($actual.name -eq "Full verification") { "workflow_full_command" } else { "workflow_step_contract" }
                    Fail-Contract $class "Step '$($actual.name)' differs from its restricted contract: actual=${actualJson}; expected=${expectedJson}."
                }
            }
        }
    }
}

if ($failures.Count -eq 0) {
    try {
        $baseline = Get-Content -LiteralPath $BaselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $expectedLocks = @("pnpm-lock.yaml", "src-tauri/Cargo.lock", "python/requirements-ci.lock")
        $actualLocks = @([string[]]$baseline.lock_files)
        if ((@($actualLocks | Sort-Object) -join ",") -ne (@($expectedLocks | Sort-Object) -join ",")) {
            Fail-Contract "baseline_lock_contract" "Baseline must list exactly the three CI lock files."
        }
        foreach ($lock in $expectedLocks) {
            $tracked = @(git -C $Root ls-files --error-unmatch -- $lock 2>$null)
            if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne 1) {
                Fail-Contract "baseline_lock_contract" "Lock file '${lock}' must be tracked."
            }
        }
    }
    catch {
        Fail-Contract "baseline_invalid" "Baseline JSON could not be validated."
    }
}

if ($failures.Count -eq 0) {
    Write-Output "Windows CI restricted workflow contract passed locally."
    exit 0
}

Write-Error ("Windows CI contract failed: " + ($failures -join "; "))
exit 1
