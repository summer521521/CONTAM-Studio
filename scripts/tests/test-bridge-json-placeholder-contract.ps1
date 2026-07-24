[CmdletBinding()]
param(
    [string]$ContractRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($ContractRoot)) {
    $ContractRoot = Join-Path $root "contracts\python-rust-bridge\v1.2"
}
else {
    $ContractRoot = (Resolve-Path $ContractRoot).Path
}
$manifestPath = Join-Path $ContractRoot "manifest.json"
$failures = [System.Collections.Generic.List[string]]::new()
$placeholderPattern = [regex]'\$\{[A-Z][A-Z0-9_]*\}'

function Fail-Placeholder {
    param([string]$Class, [string]$Message)
    $failures.Add("[${Class}] ${Message}")
}

function Visit-JsonStrings {
    param($Value, [string]$Location)
    if ($null -eq $Value) {
        return
    }
    if ($Value -is [string]) {
        [pscustomobject]@{ Location = $Location; Value = $Value }
        return
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $index = 0
        foreach ($item in $Value) {
            Visit-JsonStrings $item "${Location}[${index}]"
            $index++
        }
        return
    }
    foreach ($property in $Value.PSObject.Properties) {
        Visit-JsonStrings $property.Value "${Location}.$($property.Name)"
    }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    Fail-Placeholder "placeholder_manifest" "Bridge manifest is missing."
}

$declared = @{}
if ($failures.Count -eq 0) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        Fail-Placeholder "placeholder_json" "Bridge manifest JSON is invalid."
    }
    if ($failures.Count -eq 0 -and $null -eq $manifest.PSObject.Properties["path_placeholders"]) {
        Fail-Placeholder "placeholder_manifest" "Bridge manifest is missing path_placeholders."
    }
    elseif ($failures.Count -eq 0) {
        foreach ($placeholder in @($manifest.path_placeholders)) {
            $value = [string]$placeholder
            if ($value -notmatch '^\$\{[A-Z][A-Z0-9_]*\}$') {
                Fail-Placeholder "placeholder_declaration" "Declaration '${value}' is malformed."
                continue
            }
            if ($declared.ContainsKey($value)) {
                Fail-Placeholder "placeholder_duplicate_declaration" "Declaration '${value}' is duplicated."
                continue
            }
            $declared[$value] = 0
        }
    }
}

if ($failures.Count -eq 0) {
    $jsonFiles = @(Get-ChildItem -LiteralPath $ContractRoot -Recurse -File -Filter "*.json" | Where-Object { $_.FullName -ne $manifestPath })
    foreach ($jsonFile in $jsonFiles) {
        try {
            $document = Get-Content -LiteralPath $jsonFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        }
        catch {
            Fail-Placeholder "placeholder_json" "$($jsonFile.Name) is invalid JSON."
            continue
        }
        foreach ($stringValue in @(Visit-JsonStrings $document $jsonFile.FullName)) {
            $value = [string]$stringValue.Value
            $matches = @($placeholderPattern.Matches($value))
            $withoutValidTokens = $placeholderPattern.Replace($value, "")
            if ($withoutValidTokens.Contains('${')) {
                Fail-Placeholder "placeholder_malformed" "$($stringValue.Location) contains malformed placeholder syntax."
            }
            foreach ($match in $matches) {
                $placeholder = $match.Value
                if (-not $declared.ContainsKey($placeholder)) {
                    Fail-Placeholder "placeholder_undeclared" "$($stringValue.Location) uses undeclared ${placeholder}."
                }
                else {
                    $declared[$placeholder]++
                }
            }
        }
    }
    foreach ($placeholder in $declared.Keys) {
        if ($declared[$placeholder] -eq 0) {
            Fail-Placeholder "placeholder_unused_declaration" "Declaration ${placeholder} is unused by bridge fixtures."
        }
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host "Bridge JSON placeholder contract passed: $($declared.Count) declared placeholders were decoded and used."
