use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

pub const CLOSE_REQUESTED_EVENT: &str = "contam-studio://app-close-requested";

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CloseActivityInput {
    pub draft_dirty: bool,
    pub draft_exported: bool,
    pub patch_review: bool,
    pub run_active: bool,
    pub export_active: bool,
    pub ingestion_active: bool,
    pub ai_turn_active: bool,
}

impl CloseActivityInput {
    fn needs_draft_decision(&self) -> bool {
        self.draft_dirty && !self.draft_exported
    }

    fn active_work(&self) -> Vec<&'static str> {
        let mut work = Vec::new();
        if self.patch_review {
            work.push("patch_review");
        }
        if self.run_active {
            work.push("run");
        }
        if self.export_active {
            work.push("export");
        }
        if self.ingestion_active {
            work.push("ingestion");
        }
        if self.ai_turn_active {
            work.push("ai_turn");
        }
        work
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct CloseRequestView {
    pub request_id: String,
    pub draft_decision_required: bool,
    pub active_work: Vec<String>,
    pub repeated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct CloseResolution {
    pub request_id: String,
    pub status: String,
    pub needs_export: bool,
    pub close_started: bool,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingPhase {
    Decision,
    DraftExport,
}

#[derive(Debug, Clone)]
struct PendingClose {
    request_id: String,
    phase: PendingPhase,
}

#[derive(Debug, Default)]
struct CloseState {
    activity: CloseActivityInput,
    pending: Option<PendingClose>,
    next_request: u64,
    allow_next_close: bool,
}

#[derive(Debug, Default)]
pub struct CloseProtocolStore {
    state: Mutex<CloseState>,
}

impl CloseProtocolStore {
    fn set_activity(&self, activity: CloseActivityInput) -> CloseActivityInput {
        let mut state = self.state.lock().expect("close protocol mutex poisoned");
        state.activity = activity.clone();
        activity
    }

    fn request(&self) -> CloseRequestOutcome {
        let mut state = self.state.lock().expect("close protocol mutex poisoned");
        if state.allow_next_close {
            state.allow_next_close = false;
            return CloseRequestOutcome::Allow;
        }
        if let Some(pending) = state.pending.as_ref() {
            return CloseRequestOutcome::Prompt(CloseRequestView {
                request_id: pending.request_id.clone(),
                draft_decision_required: state.activity.needs_draft_decision(),
                active_work: state
                    .activity
                    .active_work()
                    .into_iter()
                    .map(str::to_owned)
                    .collect(),
                repeated: true,
            });
        }
        let active_work = state.activity.active_work();
        let draft_decision_required = state.activity.needs_draft_decision();
        if active_work.is_empty() && !draft_decision_required {
            state.allow_next_close = true;
            return CloseRequestOutcome::Allow;
        }
        state.next_request = state.next_request.saturating_add(1);
        let request_id = format!("close-{}", state.next_request);
        state.pending = Some(PendingClose {
            request_id: request_id.clone(),
            phase: PendingPhase::Decision,
        });
        CloseRequestOutcome::Prompt(CloseRequestView {
            request_id,
            draft_decision_required,
            active_work: active_work.into_iter().map(str::to_owned).collect(),
            repeated: false,
        })
    }

    fn resolve(&self, request_id: &str, decision: CloseDecision) -> CloseResolution {
        let mut state = self.state.lock().expect("close protocol mutex poisoned");
        let Some(pending) = state.pending.as_ref() else {
            return invalid_resolution(request_id, "close_not_pending");
        };
        if pending.request_id != request_id {
            return invalid_resolution(request_id, "close_request_mismatch");
        }
        if pending.phase != PendingPhase::Decision {
            return invalid_resolution(request_id, "close_export_pending");
        }
        match decision {
            CloseDecision::Cancel => {
                state.pending = None;
                CloseResolution {
                    request_id: request_id.to_owned(),
                    status: "cancelled".to_owned(),
                    needs_export: false,
                    close_started: false,
                    error_code: None,
                }
            }
            CloseDecision::DiscardDraft => {
                if !state.activity.active_work().is_empty() {
                    return invalid_resolution(request_id, "close_active_work");
                }
                state.activity.draft_dirty = false;
                state.activity.draft_exported = true;
                state.pending = None;
                state.allow_next_close = true;
                CloseResolution {
                    request_id: request_id.to_owned(),
                    status: "closing".to_owned(),
                    needs_export: false,
                    close_started: true,
                    error_code: None,
                }
            }
            CloseDecision::ExportDraft => {
                if !state.activity.active_work().is_empty() {
                    return invalid_resolution(request_id, "close_active_work");
                }
                if let Some(pending) = state.pending.as_mut() {
                    pending.phase = PendingPhase::DraftExport;
                }
                CloseResolution {
                    request_id: request_id.to_owned(),
                    status: "awaiting_draft_export".to_owned(),
                    needs_export: true,
                    close_started: false,
                    error_code: None,
                }
            }
        }
    }

    fn finish_export(&self, request_id: &str, succeeded: bool) -> CloseResolution {
        let mut state = self.state.lock().expect("close protocol mutex poisoned");
        let Some(pending) = state.pending.as_ref() else {
            return invalid_resolution(request_id, "close_not_pending");
        };
        if pending.request_id != request_id {
            return invalid_resolution(request_id, "close_request_mismatch");
        }
        if pending.phase != PendingPhase::DraftExport {
            return invalid_resolution(request_id, "close_export_not_requested");
        }
        if !succeeded {
            if let Some(pending) = state.pending.as_mut() {
                pending.phase = PendingPhase::Decision;
            }
            return CloseResolution {
                request_id: request_id.to_owned(),
                status: "export_failed".to_owned(),
                needs_export: true,
                close_started: false,
                error_code: Some("draft_export_failed".to_owned()),
            };
        }
        state.activity.draft_dirty = false;
        state.activity.draft_exported = true;
        state.pending = None;
        state.allow_next_close = true;
        CloseResolution {
            request_id: request_id.to_owned(),
            status: "closing".to_owned(),
            needs_export: false,
            close_started: true,
            error_code: None,
        }
    }

    #[cfg(test)]
    fn pending_request(&self) -> Option<CloseRequestView> {
        let state = self.state.lock().expect("close protocol mutex poisoned");
        state.pending.as_ref().map(|pending| CloseRequestView {
            request_id: pending.request_id.clone(),
            draft_decision_required: state.activity.needs_draft_decision(),
            active_work: state
                .activity
                .active_work()
                .into_iter()
                .map(str::to_owned)
                .collect(),
            repeated: false,
        })
    }
}

enum CloseRequestOutcome {
    Allow,
    Prompt(CloseRequestView),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseDecision {
    Cancel,
    DiscardDraft,
    ExportDraft,
}

fn invalid_resolution(request_id: &str, code: &str) -> CloseResolution {
    CloseResolution {
        request_id: request_id.to_owned(),
        status: "blocked".to_owned(),
        needs_export: false,
        close_started: false,
        error_code: Some(code.to_owned()),
    }
}

fn close_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let store = window.state::<CloseProtocolStore>();
        match store.request() {
            CloseRequestOutcome::Allow => {}
            CloseRequestOutcome::Prompt(view) => {
                api.prevent_close();
                let _ = window.emit(CLOSE_REQUESTED_EVENT, view);
            }
        }
    }
}

#[tauri::command]
pub fn set_close_activity(
    store: tauri::State<'_, CloseProtocolStore>,
    activity: CloseActivityInput,
) -> CloseActivityInput {
    store.set_activity(activity)
}

#[tauri::command]
pub fn resolve_app_close(
    app: AppHandle,
    store: tauri::State<'_, CloseProtocolStore>,
    request_id: String,
    decision: CloseDecision,
) -> CloseResolution {
    let resolution = store.resolve(&request_id, decision);
    if resolution.close_started {
        close_window(&app);
    }
    resolution
}

#[tauri::command]
pub fn finish_app_close_draft_export(
    app: AppHandle,
    store: tauri::State<'_, CloseProtocolStore>,
    request_id: String,
    succeeded: bool,
) -> CloseResolution {
    let resolution = store.finish_export(&request_id, succeeded);
    if resolution.close_started {
        close_window(&app);
    }
    resolution
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirty() -> CloseActivityInput {
        CloseActivityInput {
            draft_dirty: true,
            ..CloseActivityInput::default()
        }
    }

    #[test]
    fn clean_idle_close_is_allowed_without_prompt() {
        let store = CloseProtocolStore::default();
        store.set_activity(CloseActivityInput::default());
        assert!(matches!(store.request(), CloseRequestOutcome::Allow));
    }

    #[test]
    fn dirty_draft_requires_one_stable_request_and_export() {
        let store = CloseProtocolStore::default();
        store.set_activity(dirty());
        let first = match store.request() {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let repeated = match store.request() {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("repeated close must remain pending"),
        };
        assert_eq!(first.request_id, repeated.request_id);
        assert!(repeated.repeated);
        let prepared = store.resolve(&first.request_id, CloseDecision::ExportDraft);
        assert_eq!(prepared.status, "awaiting_draft_export");
        let failed = store.finish_export(&first.request_id, false);
        assert_eq!(failed.status, "export_failed");
        let cancelled = store.resolve(&first.request_id, CloseDecision::Cancel);
        assert_eq!(cancelled.status, "cancelled");
        assert!(store.pending_request().is_none());
    }

    #[test]
    fn active_work_cannot_be_discarded_or_reported_stopped() {
        let store = CloseProtocolStore::default();
        store.set_activity(CloseActivityInput {
            run_active: true,
            ai_turn_active: true,
            ..dirty()
        });
        let request = match store.request() {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("active work must prompt"),
        };
        let blocked = store.resolve(&request.request_id, CloseDecision::DiscardDraft);
        assert_eq!(blocked.status, "blocked");
        assert_eq!(blocked.error_code.as_deref(), Some("close_active_work"));
        let cancelled = store.resolve(&request.request_id, CloseDecision::Cancel);
        assert_eq!(cancelled.status, "cancelled");
    }

    #[test]
    fn successful_export_marks_close_ready_only_after_completion() {
        let store = CloseProtocolStore::default();
        store.set_activity(dirty());
        let request = match store.request() {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let prepared = store.resolve(&request.request_id, CloseDecision::ExportDraft);
        assert!(!prepared.close_started);
        let finished = store.finish_export(&request.request_id, true);
        assert!(finished.close_started);
        assert!(matches!(store.request(), CloseRequestOutcome::Allow));
    }

    #[test]
    fn stale_and_duplicate_resolutions_fail_closed() {
        let store = CloseProtocolStore::default();
        store.set_activity(dirty());
        let request = match store.request() {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let stale = store.resolve("close-999", CloseDecision::Cancel);
        assert_eq!(stale.error_code.as_deref(), Some("close_request_mismatch"));
        let cancelled = store.resolve(&request.request_id, CloseDecision::Cancel);
        assert_eq!(cancelled.status, "cancelled");
        let duplicate = store.resolve(&request.request_id, CloseDecision::Cancel);
        assert_eq!(duplicate.error_code.as_deref(), Some("close_not_pending"));
    }
}
