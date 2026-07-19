# Phase 6A First-Paint Black Screen

```yaml
task_id: phase-6a-first-paint-black-screen
phase: Phase 6A
title: Replace the delayed desktop black screen with an immediate startup surface
status: completed
record_origin: live
started_at_utc: 2026-07-19T13:47:59.8013303Z
ended_at_utc: 2026-07-19T13:58:01.0854178Z
duration_seconds: 601
base_commit: 0b8bade
branch: codex/phase-6a-codex-readonly-assistant
manual_gui_validation_status: pending_user
task_source: ChatGPT Web coordination
task_summary: Investigate the user-measured approximately 5-second native-window delay followed by approximately 15 seconds of black screen, then close the first-paint gap without weakening the explicit Codex connection or read-only AI boundaries.
goals:
  - Identify whether the remaining delay occurs before the web UI first paint
  - Ensure the native window never presents an unexplained black surface while the frontend loads
  - Preserve manual Codex connection and all existing project security boundaries
allowed_scope: Phase 6A desktop startup presentation, focused tests, documentation, and task log
forbidden_scope: automatic Codex connection, authentication changes, project-context transmission, broad UI redesign, and unrelated features
files_changed:
  - index.html
  - src/components/workbench/ZoneAirStateResults.tsx
  - src/styles/app.css
  - src/i18n/locales/zh-CN.json
  - src/i18n/locales/en.json
  - README.md
  - docs/current-state.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-first-paint-black-screen.md
validation:
  - Python pytest: 266 passed
  - Python Ruff: passed
  - Frontend Vitest: 121 passed
  - Frontend production build: passed; initial JavaScript reduced from approximately 985 KB to 431 KB and the 555 KB ECharts chart became lazy
  - Rust tests: 61 passed, 1 ignored
  - Rust fmt and check: passed
  - git diff --check: passed
  - JSON parse: 14 files passed
  - Markdown relative links: 87 checked
  - pnpm frozen offline lock check and Cargo locked metadata: passed
delivery_status: completed_in_pull_request
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: User timing separates native-window appearance from the subsequent approximately 15-second black interval. A static bilingual startup surface now paints before React, and ECharts is deferred until a result chart is needed. Manual Tauri first-paint timing remains pending_user. Existing user-generated untracked PRJ and CSV and the pre-existing src-tauri/Cargo.toml working-tree change remain unmodified and out of scope.
```
