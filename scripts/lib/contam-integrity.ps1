# Shared PowerShell 5.1-compatible integrity helpers for official CONTAM tools.
# Keep this implementation independent of Get-FileHash/module auto-loading so it
# behaves identically in redirected CI and unattended child processes.

function Get-ContamSha256Hex {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = [IO.Path]::GetFullPath($Path)
    $stream = $null
    $sha256 = $null
    try {
        $stream = New-Object System.IO.FileStream(
            $fullPath,
            [IO.FileMode]::Open,
            [IO.FileAccess]::Read,
            [IO.FileShare]::Read
        )
        $sha256 = [Security.Cryptography.SHA256]::Create()
        $digest = $sha256.ComputeHash($stream)
        return ([BitConverter]::ToString($digest)).Replace("-", "").ToUpperInvariant()
    }
    finally {
        if ($null -ne $stream) {
            $stream.Dispose()
        }
        if ($null -ne $sha256) {
            $sha256.Dispose()
        }
    }
}
