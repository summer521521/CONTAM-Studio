use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use crate::{
    codex_app_server::CodexAssistantStore,
    zone_bridge::{DesktopProjectSessionStore, ProjectCloseSnapshot},
};

pub const CLOSE_REQUESTED_EVENT: &str = "contam-studio://app-close-requested";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CloseActivity {
    draft_dirty: bool,
    draft_exported: bool,
    patch_review: bool,
    project_operation_active: bool,
    ai_activity_active: bool,
}

impl CloseActivity {
    fn needs_draft_decision(&self) -> bool {
        self.draft_dirty && !self.draft_exported
    }

    fn active_work(&self) -> Vec<&'static str> {
        let mut work = Vec::new();
        if self.patch_review {
            work.push("patch_review");
        }
        if self.project_operation_active {
            work.push("project_operation");
        }
        if self.ai_activity_active {
            work.push("ai_turn");
        }
        work
    }
}

impl From<ProjectCloseSnapshot> for CloseActivity {
    fn from(value: ProjectCloseSnapshot) -> Self {
        Self {
            draft_dirty: value.draft_dirty,
            draft_exported: value.draft_exported,
            patch_review: value.patch_review,
            project_operation_active: value.operation_active,
            ai_activity_active: false,
        }
    }
}

fn current_activity(
    project: &DesktopProjectSessionStore,
    assistant: &CodexAssistantStore,
) -> CloseActivity {
    let mut activity = CloseActivity::from(project.close_snapshot());
    activity.ai_activity_active = assistant.close_activity_active();
    activity
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
    pending: Option<PendingClose>,
    next_request: u64,
    allow_next_close: bool,
}

#[derive(Debug, Default)]
pub struct CloseProtocolStore {
    state: Mutex<CloseState>,
}

impl CloseProtocolStore {
    fn request(&self, activity: &CloseActivity) -> CloseRequestOutcome {
        let mut state = self.state.lock().expect("close protocol mutex poisoned");
        if state.allow_next_close {
            state.allow_next_close = false;
            return CloseRequestOutcome::Allow;
        }
        if let Some(pending) = state.pending.as_ref() {
            return CloseRequestOutcome::Prompt(CloseRequestView {
                request_id: pending.request_id.clone(),
                draft_decision_required: activity.needs_draft_decision(),
                active_work: activity
                    .active_work()
                    .into_iter()
                    .map(str::to_owned)
                    .collect(),
                repeated: true,
            });
        }
        let active_work = activity.active_work();
        let draft_decision_required = activity.needs_draft_decision();
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

    fn resolve(
        &self,
        request_id: &str,
        decision: CloseDecision,
        activity: &CloseActivity,
    ) -> CloseResolution {
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
                if !activity.active_work().is_empty() {
                    return invalid_resolution(request_id, "close_active_work");
                }
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
                if !activity.active_work().is_empty() {
                    return invalid_resolution(request_id, "close_active_work");
                }
                if !activity.needs_draft_decision() {
                    return invalid_resolution(request_id, "close_export_not_required");
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

    fn finish_export(
        &self,
        request_id: &str,
        succeeded: bool,
        activity: &CloseActivity,
    ) -> CloseResolution {
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
        if !succeeded || activity.needs_draft_decision() || !activity.active_work().is_empty() {
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
    fn pending_request(&self, activity: &CloseActivity) -> Option<CloseRequestView> {
        let state = self.state.lock().expect("close protocol mutex poisoned");
        state.pending.as_ref().map(|pending| CloseRequestView {
            request_id: pending.request_id.clone(),
            draft_decision_required: activity.needs_draft_decision(),
            active_work: activity
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
        let activity = current_activity(
            &window.state::<DesktopProjectSessionStore>(),
            &window.state::<CodexAssistantStore>(),
        );
        match store.request(&activity) {
            CloseRequestOutcome::Allow => {}
            CloseRequestOutcome::Prompt(view) => {
                api.prevent_close();
                let _ = window.emit(CLOSE_REQUESTED_EVENT, view);
            }
        }
    }
}

#[tauri::command]
pub fn resolve_app_close(
    app: AppHandle,
    store: tauri::State<'_, CloseProtocolStore>,
    project: tauri::State<'_, DesktopProjectSessionStore>,
    assistant: tauri::State<'_, CodexAssistantStore>,
    request_id: String,
    decision: CloseDecision,
) -> CloseResolution {
    let activity = current_activity(&project, &assistant);
    let resolution = store.resolve(&request_id, decision, &activity);
    if resolution.close_started {
        close_window(&app);
    }
    resolution
}

#[tauri::command]
pub fn finish_app_close_draft_export(
    app: AppHandle,
    store: tauri::State<'_, CloseProtocolStore>,
    project: tauri::State<'_, DesktopProjectSessionStore>,
    assistant: tauri::State<'_, CodexAssistantStore>,
    request_id: String,
    succeeded: bool,
) -> CloseResolution {
    let activity = current_activity(&project, &assistant);
    let resolution = store.finish_export(&request_id, succeeded, &activity);
    if resolution.close_started {
        close_window(&app);
    }
    resolution
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirty() -> CloseActivity {
        CloseActivity {
            draft_dirty: true,
            ..CloseActivity::default()
        }
    }

    #[test]
    fn clean_idle_close_is_allowed_without_prompt() {
        let store = CloseProtocolStore::default();
        assert!(matches!(
            store.request(&CloseActivity::default()),
            CloseRequestOutcome::Allow
        ));
    }

    #[test]
    fn dirty_draft_requires_one_stable_request_and_export() {
        let store = CloseProtocolStore::default();
        let dirty = dirty();
        let first = match store.request(&dirty) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let repeated = match store.request(&dirty) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("repeated close must remain pending"),
        };
        assert_eq!(first.request_id, repeated.request_id);
        assert!(repeated.repeated);
        let prepared = store.resolve(&first.request_id, CloseDecision::ExportDraft, &dirty);
        assert_eq!(prepared.status, "awaiting_draft_export");
        let failed = store.finish_export(&first.request_id, false, &dirty);
        assert_eq!(failed.status, "export_failed");
        let cancelled = store.resolve(&first.request_id, CloseDecision::Cancel, &dirty);
        assert_eq!(cancelled.status, "cancelled");
        assert!(store.pending_request(&dirty).is_none());
    }

    #[test]
    fn active_work_cannot_be_discarded_or_reported_stopped() {
        let store = CloseProtocolStore::default();
        let active = CloseActivity {
            project_operation_active: true,
            ai_activity_active: true,
            ..dirty()
        };
        let request = match store.request(&active) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("active work must prompt"),
        };
        let blocked = store.resolve(&request.request_id, CloseDecision::DiscardDraft, &active);
        assert_eq!(blocked.status, "blocked");
        assert_eq!(blocked.error_code.as_deref(), Some("close_active_work"));
        let cancelled = store.resolve(&request.request_id, CloseDecision::Cancel, &active);
        assert_eq!(cancelled.status, "cancelled");
    }

    #[test]
    fn successful_export_marks_close_ready_only_after_completion() {
        let store = CloseProtocolStore::default();
        let dirty = dirty();
        let request = match store.request(&dirty) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let prepared = store.resolve(&request.request_id, CloseDecision::ExportDraft, &dirty);
        assert!(!prepared.close_started);
        let exported = CloseActivity {
            draft_exported: true,
            ..dirty
        };
        let finished = store.finish_export(&request.request_id, true, &exported);
        assert!(finished.close_started);
        assert!(matches!(
            store.request(&exported),
            CloseRequestOutcome::Allow
        ));
    }

    #[test]
    fn stale_and_duplicate_resolutions_fail_closed() {
        let store = CloseProtocolStore::default();
        let dirty = dirty();
        let request = match store.request(&dirty) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let stale = store.resolve("close-999", CloseDecision::Cancel, &dirty);
        assert_eq!(stale.error_code.as_deref(), Some("close_request_mismatch"));
        let cancelled = store.resolve(&request.request_id, CloseDecision::Cancel, &dirty);
        assert_eq!(cancelled.status, "cancelled");
        let duplicate = store.resolve(&request.request_id, CloseDecision::Cancel, &dirty);
        assert_eq!(duplicate.error_code.as_deref(), Some("close_not_pending"));
    }

    #[test]
    fn webview_cannot_claim_an_unexported_draft_was_exported() {
        let store = CloseProtocolStore::default();
        let dirty = dirty();
        let request = match store.request(&dirty) {
            CloseRequestOutcome::Prompt(view) => view,
            CloseRequestOutcome::Allow => panic!("dirty draft must prompt"),
        };
        let prepared = store.resolve(&request.request_id, CloseDecision::ExportDraft, &dirty);
        assert_eq!(prepared.status, "awaiting_draft_export");
        let rejected = store.finish_export(&request.request_id, true, &dirty);
        assert_eq!(rejected.status, "export_failed");
        assert!(!rejected.close_started);
    }
}
