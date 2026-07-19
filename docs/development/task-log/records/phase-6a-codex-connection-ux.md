# Phase 6A Codex Connection UX Hardening

```yaml
task_id: phase-6a-codex-connection-ux
phase: Phase 6A
title: Codex read-only assistant connection recovery and disclosure UX hardening
status: completed
record_origin: live
started_at_utc: 2026-07-19T06:56:35.6215347Z
ended_at_utc: 2026-07-19T07:09:54.9404029Z
duration_seconds: 799
base_commit: 927466af761a4a90040ec80cd9c11319019930d5
branch: codex/phase-6a-codex-readonly-assistant
manual_gui_validation_status: pending_user
task_source: ChatGPT Web coordination
task_summary: Investigate slow Codex connection feedback, make the required context-preview gate legible, and harden connection recovery when the local App Server has become stale after a project workflow change.
goals:
  - Preserve explicit Rust-generated preview-before-send without a misleading disabled send control
  - Detect and replace stale local App Server connections instead of returning a disconnected catalog
  - Document the distinction between development cold start and lazy network-backed Codex connection latency
allowed_scope: Phase 6A Codex App Server adapter, AI panel state and wording, focused tests, documentation, and task log
forbidden_scope: relaxed read-only constraints, project path disclosure, AI write capability, Codex authentication changes, and unrelated refactors
files_changed:
  - src-tauri/src/codex_app_server.rs
  - src-tauri/tauri.conf.json
  - src/app/ai-state.ts
  - src/app/ai-state.test.tsx
  - src/components/workbench/CodexAssistantPanel.tsx
  - src/i18n/locales/en.json
  - src/i18n/locales/zh-CN.json
  - docs/architecture/codex-readonly-assistant.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-codex-connection-ux.md
validation:
  - "Python: 266 pytest passed; Ruff passed"
  - "Frontend: 11 Vitest files and 120 tests passed; production build passed"
  - "Rust: 60 tests passed, 1 explicitly ignored; fmt and check passed"
  - "General: Markdown relative links, tracked JSON, frozen pnpm/Cargo lock metadata, and git diff checks passed"
  - "Focused recovery: a dead App Server no longer returns a stale catalog; the next explicit connect replaces it"
delivery_status: included_in_current_delivery_commit
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Preserved the Rust-generated preview-before-send gate, but made it explicit beside the disabled Send action and visible during connection. A stale App Server now clears its catalog and is closed before a user-initiated reconnect. The native window uses the workbench background color to reduce cold-start white flash; development build and network-backed connection latency remain distinct. Existing user-generated untracked PRJ and CSV remain untouched and unstaged. src-tauri/Cargo.toml is a pre-existing timestamp-only working-tree change with no content diff and will not be changed. Manual GUI validation remains pending_user. The client did not provide exact per-task token data.
```
