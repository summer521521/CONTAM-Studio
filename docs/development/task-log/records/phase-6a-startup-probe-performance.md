# Phase 6A Startup And CLI Probe Performance

```yaml
task_id: phase-6a-startup-probe-performance
phase: Phase 6A
title: Bound desktop startup and Codex CLI probe latency
status: completed
record_origin: live
started_at_utc: 2026-07-19T12:59:45.2572877Z
ended_at_utc: 2026-07-19T13:16:56.1500812Z
duration_seconds: 1031
base_commit: 5293c3d
branch: codex/phase-6a-codex-readonly-assistant
manual_gui_validation_status: pending_user
task_source: ChatGPT Web coordination
task_summary: Diagnose the reported 30-second desktop display delay and 65-second local Codex CLI check, then make the startup probe reliably bounded without starting the App Server or changing the explicit-connect privacy boundary.
goals:
  - Identify the actual latency source instead of masking it with UI text
  - Keep the first-paint CLI check local, bounded, and independent from project operations
  - Restore an interactive AI panel promptly on timeout or probe failure
allowed_scope: Phase 6A CLI discovery and probe execution, focused desktop state, tests, documentation, and task log
forbidden_scope: automatic App Server connection, automatic login, model calls, project-context transmission, broad startup refactors, and unrelated features
files_changed:
  - README.md
  - docs/architecture/codex-readonly-assistant.md
  - docs/current-state.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-startup-probe-performance.md
  - src-tauri/src/codex_app_server.rs
validation:
  - "Measured local codex --version five times: 47.70-51.89 ms, average 49.29 ms"
  - "Rust: 61 passed, 1 ignored; cargo fmt --check and cargo check passed"
  - "Frontend: 121 passed; TypeScript and Vite production build passed"
  - "Python: 266 passed; Ruff passed"
  - "General: 89 Markdown relative links, 12 JSON documents, frozen pnpm lock, Cargo locked metadata, and git diff checks passed"
delivery_status: completed_in_pull_request
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: The 65-second in-window CLI check was traced to hashing the approximately 341 MB Codex executable twice during a presence-only startup probe. Startup now uses bounded metadata plus strict version probing, while explicit connection and post-install verification retain full pre/post SHA-256. The separate approximately 30-second pnpm tauri dev pre-window delay remains attributable to the development build/link stage and requires user timing after the update; manual GUI validation therefore remains pending_user. Existing user-generated untracked PRJ and CSV remain untouched and unstaged. The pre-existing src-tauri/Cargo.toml timestamp-only working-tree change remains out of scope. Exact per-task token counts were unavailable.
```
