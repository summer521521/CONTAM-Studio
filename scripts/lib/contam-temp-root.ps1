# Shared, PowerShell 5.1-compatible temporary-root and path-boundary helpers.
# The caller may provide an explicit path; otherwise CI and local fallbacks are
# selected without assuming a particular drive exists.

function Resolve-ContamAbsolutePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "A non-empty path is required."
    }
    return [IO.Path]::GetFullPath($Path)
}

function Resolve-ContamTempRoot {
    param([string]$ExplicitRoot = "")

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRoot)) {
        return Resolve-ContamAbsolutePath $ExplicitRoot
    }

    if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        return Resolve-ContamAbsolutePath (Join-Path $env:RUNNER_TEMP "CONTAM Studio")
    }

    $localCodexRoot = "F:\Codex_File"
    if (Test-ContamLocalCodexRoot $localCodexRoot) {
        return Resolve-ContamAbsolutePath (Join-Path $localCodexRoot "CONTAM Studio")
    }

    return Resolve-ContamAbsolutePath (Join-Path ([IO.Path]::GetTempPath()) "CONTAM Studio")
}

# Separated for deterministic no-F-drive contract tests without touching the
# real drive or global environment. Production callers use the real Test-Path.
function Test-ContamLocalCodexRoot {
    param([Parameter(Mandatory = $true)][string]$Path)
    return Test-Path -LiteralPath $Path -PathType Container
}

function Resolve-ContamToolsTaskRoot {
    param([string]$ExplicitRoot = "")

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRoot)) {
        return Resolve-ContamAbsolutePath $ExplicitRoot
    }

    return Resolve-ContamAbsolutePath (Join-Path (Resolve-ContamTempRoot) "contam-tools")
}

function Test-ContamPathWithinRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$Root
    )

    try {
        $candidateFull = (Resolve-ContamAbsolutePath $Candidate).TrimEnd("\")
        $rootFull = (Resolve-ContamAbsolutePath $Root).TrimEnd("\")
        if ($candidateFull.Equals($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }

        return $candidateFull.StartsWith(($rootFull + "\"), [StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}
