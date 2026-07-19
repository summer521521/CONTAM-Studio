# Phase 6A Assistant Protocol Fix

```yaml
task_id: phase-6a-assistant-protocol-fix
phase: Phase 6A
title: Codex read-only assistant preview and current App Server protocol fix
status: completed
record_origin: live
started_at_utc: 2026-07-19T06:03:55.5441728Z
ended_at_utc: 2026-07-19T06:29:01.1619366Z
duration_seconds: 1506
base_commit: fab65cb48f25c7a0c022f6307e444ecbea0e86da
branch: codex/phase-6a-codex-readonly-assistant
manual_gui_validation_status: pending_user
task_source: ChatGPT Web coordination
task_summary: Fix the AI context preview toggle state and align read-only Thread creation with the installed Codex App Server protocol without relaxing project or tool-use safety boundaries.
goals:
  - Make an already generated context preview explicitly collapsible without changing its validity
  - Diagnose and fix the current Codex App Server read-only Thread contract
  - Preserve explicit preview-before-send, bounded process behavior, and tool-event blocking
allowed_scope: Phase 6A Rust App Server adapter, AI panel state/UI, focused tests and matching documentation
forbidden_scope: relaxed sandboxing, project file access, tool enablement, AI write workflows, other AI backends and unrelated refactors
files_changed:
  - src-tauri/src/codex_app_server.rs
  - src/app/ai-state.ts
  - src/app/ai-state.test.tsx
  - src/app/App.tsx
  - src/components/workbench/CodexAssistantPanel.tsx
  - src/components/workbench/ContextSidebar.tsx
  - src/i18n/locales/en.json
  - src/i18n/locales/zh-CN.json
  - docs/architecture/codex-readonly-assistant.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-assistant-protocol-fix.md
validation:
  - "Python: 266 pytest passed; Ruff passed"
  - "Frontend: 11 Vitest files and 117 tests passed; production build passed"
  - "Rust: 58 tests passed, 1 explicitly ignored; fmt and check passed"
  - "General: 63 Markdown relative links, 8 tracked JSON documents, frozen pnpm lock, Cargo locked metadata, and diff check passed"
  - "Real non-GUI Codex App Server: CLI 0.144.6; readOnly, networkAccess=false, approval=never, controlled cwd, and only the controlled runtime root verified; synthetic structured context returned a valid answer with no tool event or path leak"
delivery_status: included_in_current_delivery_commit
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Fixed the preview control so an approved disclosure toggles visibility without losing its preview ID or send eligibility. Fixed Codex CLI 0.144.6 Thread validation so inherited instruction-source metadata and a sole controlled runtime root do not falsely reject the thread; all project, draft, run, and result roots remain rejected. Existing user-generated untracked PRJ and CSV remain untouched and unstaged. src-tauri/Cargo.toml was observed as modified by timestamp only; its content diff is empty and will not be changed by this task. Manual GUI validation remains pending_user.
```
