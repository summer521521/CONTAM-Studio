# Frozen Python worker staging directory

`scripts/build-python-worker.ps1` generates the Windows x64 one-folder worker
here immediately before a release build. Generated files are intentionally
ignored by Git and are embedded as Tauri resources plus copied into the
portable release.

A release build must fail if `contam-studio-python-worker.exe`,
its `_internal` directory, or `runtime-manifest.json` is absent.
