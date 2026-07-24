# v1 Information Architecture

## Primary surfaces

| Surface | Purpose | Safe state shown | Hidden/disabled rule |
| --- | --- | --- | --- |
| Project | open source and inspect compatibility | source label, protected flag, compatibility | no fake recent projects or fake tree |
| Draft | review and manage immutable revisions | baseline/current, Diff, undo/redo | write controls disabled for read-only project |
| Runs | start and recover controlled operations | tool identity, budget, lifecycle state | no run without approved revision/tool |
| Results | page trusted result artifacts | result type, units, source run/revision | unsupported result types hidden or read-only |
| Compare | validate and compare A/B | identity matrix and deterministic difference | no interpolation or incompatible pair |
| Report | build/export evidence package | included inputs, limits, AI labels | no overwrite; external target never auto-deleted |
| Attachments | select and sanitize evidence | category, limits, disclosure status | macros/scripts/encrypted/active content rejected |
| Assistant | optional explain/prepare/execute | provider, disclosure preview, authority mode | hidden when disabled; no generic tools |
| Settings | language, paths/status, tools, policy | offline/AI/tool/storage state | no raw env/path editing for users |
| Activity | lifecycle/audit/recovery | safe event summaries and diagnostics | no credentials or raw paths |
| Evidence | inspect hashes/dependencies | artifact IDs, citations, statuses | raw manifest/path only in trusted backend |

## State model

```text
no_project -> inspecting -> ready_read_only | ready_editable | unsupported | corrupt
ready_editable -> patch_review -> applying -> revision_ready
revision_ready -> queued -> starting -> running -> succeeded | failed | timed_out | cancelled | unknown_cleanup
succeeded -> results_ready -> compare_ready -> report_ready -> exported
any_state -> recovery_required -> recovered | read_only
```

Every transition is owned by a Rust/Python semantic command and carries a generation; late responses cannot move a newer state backward.

## Local preferences

Only language, density, theme, last safe surface and reduced-motion preference are stored. Preferences contain no project paths, credentials, raw PRJ, AI transcript or authority token.
