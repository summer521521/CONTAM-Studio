# Phase 6A Codex CLI Startup Probe

```yaml
task_id: phase-6a-cli-startup-probe
phase: Phase 6A
title: Clarify Codex CLI availability before an AI connection is started
status: completed
record_origin: live
started_at_utc: 2026-07-19T07:24:29.5960973Z
ended_at_utc: 2026-07-19T07:34:58.6820639Z
duration_seconds: 629
base_commit: c8eaa7c
branch: codex/phase-6a-codex-readonly-assistant
manual_gui_validation_status: pending_user
task_source: ChatGPT Web coordination
task_summary: Add a bounded local Codex CLI presence probe after the desktop UI has rendered so the assistant distinguishes an installed CLI from an unconnected AI session without starting the App Server or model inference.
goals:
  - Show a checking state followed by installed-or-not-installed CLI status before explicit AI connection
  - Preserve no automatic App Server startup, authentication changes, model calls, or project access
  - Keep repeated controlled installation requests safe and visibly unnecessary when a verified CLI exists
allowed_scope: Phase 6A AI state, desktop CLI probe reuse, focused tests, documentation, and task log
forbidden_scope: automatic AI connection, authentication changes, project-context transmission, AI write capability, and unrelated refactors
files_changed:
  - README.md
  - docs/architecture/codex-readonly-assistant.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-cli-startup-probe.md
  - src/app/App.tsx
  - src/app/ai-state.ts
  - src/app/ai-state.test.tsx
  - src/components/workbench/CodexAssistantPanel.tsx
  - src/i18n/locales/en.json
  - src/i18n/locales/zh-CN.json
validation:
  - pnpm test: 11 files and 121 tests passed
  - pnpm build: passed; existing bundle-size warning only
  - git diff --check: passed
  - JSON parse check: passed
  - Markdown relative-link check: 62 files passed
delivery_status: ready_to_commit
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: The initial UI label previously conflated an unprobed CLI with a disconnected AI session. The startup probe is local and bounded; it does not start the App Server, authenticate, send project context, or contact a model. Manual GUI validation remains pending_user. Existing user-generated untracked PRJ and CSV remain untouched and unstaged. src-tauri/Cargo.toml is a pre-existing timestamp-only working-tree change with no content diff and will not be changed.
```
