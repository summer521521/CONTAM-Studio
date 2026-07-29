# Bundled NIST CONTAM tools

This directory is populated only by `scripts/build-contam-tools.ps1` after the
official NIST ZIP has passed the locked SHA-256 check. The repository never
stores the ZIP, EXE, DLL, cache, or extracted runtime. The verified runtime
tree is copied here only as a local Tauri package build input. The runtime lock file is
`resources/contam-tools.lock.json`.

CONTAM Studio is not an official NIST product. The NIST package's notices and
no-warranty terms must remain alongside the packaged tools.
