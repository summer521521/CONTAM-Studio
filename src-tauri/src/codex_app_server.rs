use crate::zone_bridge::{
    attachment_center::AttachmentCenterStore, sha256_file, AiTrustedContext,
    DesktopProjectSessionStore,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const CODEX_ENVIRONMENT_VARIABLE: &str = "CONTAM_STUDIO_CODEX";
const OFFICIAL_CODEX_INSTALLER_URL: &str = "https://chatgpt.com/codex/install.ps1";
const OFFICIAL_CODEX_INSTALLER_SHA256: &str =
    "95923C2AC60B963C95435AAEAEFEAAB3CBC01559E21FCE1FA501EE1F9793AC0E";
const MAX_INSTALLER_SCRIPT_BYTES: usize = 128 * 1024;
const INSTALL_TIMEOUT: Duration = Duration::from_secs(180);
const RPC_TIMEOUT: Duration = Duration::from_secs(10);
const TURN_TIMEOUT: Duration = Duration::from_secs(90);
const TURN_INTERRUPT_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const TURN_INTERRUPT_CONFIRM_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_STOP_TIMEOUT: Duration = Duration::from_secs(3);
const STREAM_JOIN_TIMEOUT: Duration = Duration::from_millis(250);
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_RPC_LINE_BYTES: usize = 256 * 1024;
const MAX_RPC_TOTAL_BYTES: usize = 8 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const MAX_PROBE_STREAM_BYTES: usize = 16 * 1024;
const MAX_CONTEXT_BYTES: usize = 32 * 1024;
const MAX_QUESTION_CHARS: usize = 2_000;
const MAX_AGENT_RESPONSE_CHARS: usize = 24_000;
const MAX_RESPONSE_ITEM_CHARS: usize = 1_200;
const MAX_ARCHIVE_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 200;
const CONTEXT_FINGERPRINT_NAMESPACE: Uuid = Uuid::from_u128(0x4bf2190f_8f82_56aa_9720_19aa44ab2a6d);
const AI_CONVERSATION_ARCHIVE_NAMESPACE: Uuid =
    Uuid::from_u128(0x05d637d2_faaa_5f3e_8a40_f657c1f755e3);
const AI_CONVERSATION_ARCHIVE_SCHEMA_VERSION: &str = "1.0";
static ARCHIVE_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(1);
const ALL_CONTEXT_SCOPES: [&str; 7] = [
    "project_summary",
    "selected_zone",
    "draft_summary",
    "run_summary",
    "result_summary",
    "diagnostics",
    "attachment_evidence",
];
const TOOL_ITEM_TYPES: [&str; 9] = [
    "commandExecution",
    "fileChange",
    "mcpToolCall",
    "dynamicToolCall",
    "webSearch",
    "computerUse",
    "imageView",
    "collabToolCall",
    "toolCall",
];

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiDiagnostic {
    code: String,
    message: String,
}

impl AiDiagnostic {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CodexCliProbeView {
    found: bool,
    version: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CodexAccountView {
    authenticated: bool,
    auth_mode: Option<String>,
    plan_type: Option<String>,
    requires_login: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CodexReasoningEffortView {
    id: String,
    description: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CodexModelView {
    id: String,
    display_name: String,
    is_default: bool,
    available: bool,
    reasoning_efforts: Vec<CodexReasoningEffortView>,
    default_reasoning_effort: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CodexConnectionView {
    status: String,
    cli: CodexCliProbeView,
    account: CodexAccountView,
    models: Vec<CodexModelView>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopCodexProbeResponse {
    request_id: String,
    probe: Option<CodexCliProbeView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopCodexConnectionResponse {
    request_id: String,
    connection: Option<CodexConnectionView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopCodexInstallResponse {
    request_id: String,
    status: String,
    probe: Option<CodexCliProbeView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiContextDisclosureView {
    preview_id: String,
    project_session_id: String,
    revision_id: String,
    revision_number: u64,
    zone_id: String,
    zone_name: String,
    included_scopes: Vec<String>,
    excluded_scopes: Vec<String>,
    context_fingerprint: String,
    payload: Value,
    disclosure: AiDisclosureBoundary,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiDisclosureBoundary {
    contains_local_paths: bool,
    contains_prj_text: bool,
    contains_complete_result_series: bool,
    model_request_uses_network: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAiContextPreviewResponse {
    request_id: String,
    preview: Option<AiContextDisclosureView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StructuredAiAnswer {
    deterministic_facts: Vec<String>,
    interpretation: String,
    limitations: Vec<String>,
    suggested_questions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiTokenUsageView {
    input_tokens: Option<u64>,
    cached_input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    total_tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAiTurnResponse {
    request_id: String,
    status: String,
    answer: Option<StructuredAiAnswer>,
    token_usage: Option<AiTokenUsageView>,
    archive: AiArchiveSaveView,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct AiArchiveSaveView {
    saved: bool,
    entry_id: Option<String>,
    warning: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiArchivedConversationEntryView {
    entry_id: String,
    revision_id: String,
    revision_number: u64,
    zone_id: String,
    zone_name: String,
    language: String,
    model_id: String,
    reasoning_effort: String,
    included_scopes: Vec<String>,
    completed_at_unix_ms: u64,
    is_current_revision: bool,
    question: String,
    answer: StructuredAiAnswer,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiConversationArchiveView {
    persistence_enabled: bool,
    entries: Vec<AiArchivedConversationEntryView>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAiConversationArchiveResponse {
    request_id: String,
    archive: Option<AiConversationArchiveView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct AiConversationArchiveFile {
    schema_version: String,
    persistence_enabled: bool,
    entries: Vec<StoredAiConversationArchiveEntry>,
}

impl Default for AiConversationArchiveFile {
    fn default() -> Self {
        Self {
            schema_version: AI_CONVERSATION_ARCHIVE_SCHEMA_VERSION.to_string(),
            persistence_enabled: false,
            entries: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct StoredAiConversationArchiveEntry {
    entry_id: String,
    baseline_source_sha256: String,
    revision_id: String,
    revision_number: u64,
    zone_id: String,
    zone_name: String,
    context_fingerprint: String,
    language: String,
    model_id: String,
    reasoning_effort: String,
    included_scopes: Vec<String>,
    completed_at_unix_ms: u64,
    question: String,
    answer: StructuredAiAnswer,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAiActionResponse {
    request_id: String,
    status: String,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug)]
struct CodexExecutable {
    path: PathBuf,
    version: String,
    source: String,
    sha256: String,
    size_bytes: u64,
    modified: Option<std::time::SystemTime>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AiThreadBinding {
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    context_fingerprint: String,
    language: String,
    model_id: String,
    reasoning_effort: String,
}

#[derive(Clone, Debug)]
struct AiPreviewRecord {
    view: AiContextDisclosureView,
    trusted: AiTrustedContext,
    language: String,
    model_id: String,
    reasoning_effort: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ConnectionLease {
    generation: u64,
    request_id: String,
}

#[derive(Default)]
struct AssistantState {
    connection: Option<Arc<AppServerConnection>>,
    cli: Option<CodexCliProbeView>,
    account: Option<CodexAccountView>,
    models: Vec<CodexModelView>,
    preview: Option<AiPreviewRecord>,
    thread_id: Option<String>,
    thread_binding: Option<AiThreadBinding>,
    // This remains available while a context invalidation is interrupting a
    // previously started turn. It must not be reused as a current thread.
    active_turn_thread_id: Option<String>,
    active_turn_id: Option<String>,
    active_turn_request_id: Option<String>,
    active_turn_epoch: Option<u64>,
    active_turn_cancel: Option<Arc<AtomicBool>>,
    active_turn_interrupt_requested: Option<Arc<AtomicBool>>,
    cancel_requested: bool,
    token_usage: Option<AiTokenUsageView>,
    installing: bool,
    context_epoch: u64,
    connection_generation: u64,
    connecting: Option<ConnectionLease>,
}

impl AssistantState {
    fn clear_active_turn(&mut self) {
        self.active_turn_thread_id = None;
        self.active_turn_id = None;
        self.active_turn_request_id = None;
        self.active_turn_epoch = None;
        self.active_turn_cancel = None;
        self.active_turn_interrupt_requested = None;
        self.cancel_requested = false;
    }

    fn clear_connection_catalog(&mut self) {
        self.cli = None;
        self.account = None;
        self.models.clear();
        self.preview = None;
        self.thread_id = None;
        self.thread_binding = None;
        self.clear_active_turn();
        self.token_usage = None;
    }

    fn reserve_connection(&mut self, request_id: &str) -> Result<ConnectionLease, AiDiagnostic> {
        if self.connecting.is_some() {
            return Err(AiDiagnostic::new(
                "codex_app_server_start_failed",
                "Codex App Server is already starting.",
            ));
        }
        self.connection_generation = self.connection_generation.wrapping_add(1);
        let lease = ConnectionLease {
            generation: self.connection_generation,
            request_id: request_id.to_string(),
        };
        self.connecting = Some(lease.clone());
        Ok(lease)
    }

    fn release_connection_lease(&mut self, lease: &ConnectionLease) {
        if self.connecting.as_ref() == Some(lease) {
            self.connecting = None;
        }
    }

    fn connection_lease_is_current(&self, lease: &ConnectionLease) -> bool {
        self.connection_generation == lease.generation && self.connecting.as_ref() == Some(lease)
    }

    fn has_connection(&self, expected: &Arc<AppServerConnection>) -> bool {
        self.connection
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, expected))
    }

    fn invalidate_connection_attempt(&mut self) {
        self.connection_generation = self.connection_generation.wrapping_add(1);
        self.connecting = None;
    }

    /// Drop a dead or incomplete connection before its stale catalog can be reused.
    fn take_unusable_connection(&mut self) -> Option<Arc<AppServerConnection>> {
        let unusable = self
            .connection
            .as_ref()
            .is_some_and(|connection| !connection.is_healthy())
            || (self.connection.is_some() && (self.cli.is_none() || self.account.is_none()));
        if !unusable {
            return None;
        }
        let connection = self.connection.take();
        self.clear_connection_catalog();
        connection
    }
}

#[derive(Default)]
pub struct CodexAssistantStore {
    state: Mutex<AssistantState>,
    // Keep an incomplete close alive so a child handle and its stream threads
    // are not detached while the controlled runtime directory is still live.
    retired_connections: Mutex<Vec<Arc<AppServerConnection>>>,
}

/// Serializes short, controlled local archive operations. The archive never
/// stores project files, App Server protocol traffic, credentials, or paths.
#[derive(Default)]
pub struct AiConversationArchiveStore {
    operation_gate: Mutex<()>,
}

impl CodexAssistantStore {
    pub(crate) fn close_activity_active(&self) -> bool {
        let state = self.state.lock().expect("Codex assistant mutex poisoned");
        state.installing || state.connecting.is_some() || state.active_turn_request_id.is_some()
    }

    fn retain_connection(&self, connection: Arc<AppServerConnection>) {
        let mut retired = self
            .retired_connections
            .lock()
            .expect("retired Codex connection mutex poisoned");
        if !retired
            .iter()
            .any(|existing| Arc::ptr_eq(existing, &connection))
        {
            retired.push(connection);
        }
    }

    fn close_or_retain(&self, connection: Arc<AppServerConnection>) -> ConnectionCloseOutcome {
        let outcome = connection.close();
        if outcome.needs_retry() {
            self.retain_connection(connection);
        }
        outcome
    }

    fn retry_retired_connections(&self) {
        let retired = std::mem::take(
            &mut *self
                .retired_connections
                .lock()
                .expect("retired Codex connection mutex poisoned"),
        );
        if retired.is_empty() {
            return;
        }
        let mut still_retired = Vec::new();
        for connection in retired {
            if connection.close().needs_retry() {
                still_retired.push(connection);
            }
        }
        if !still_retired.is_empty() {
            for connection in still_retired {
                self.retain_connection(connection);
            }
        }
    }

    pub(crate) fn invalidate_context(&self) {
        let interrupt_target = {
            let mut state = self.state.lock().expect("Codex assistant mutex poisoned");
            state.context_epoch = state.context_epoch.wrapping_add(1);
            let active_target = match (
                state.connection.clone(),
                state.active_turn_thread_id.clone(),
                state.active_turn_id.clone(),
                state.active_turn_interrupt_requested.clone(),
            ) {
                (Some(connection), Some(thread_id), Some(turn_id), Some(interrupt_requested)) => {
                    Some((connection, thread_id, turn_id, interrupt_requested))
                }
                _ => None,
            };
            state.preview = None;
            state.thread_id = None;
            state.thread_binding = None;
            state.token_usage = None;
            if state.active_turn_request_id.is_none() {
                state.cancel_requested = false;
                None
            } else {
                state.cancel_requested = true;
                if let Some(cancel) = &state.active_turn_cancel {
                    cancel.store(true, Ordering::Release);
                }
                active_target
            }
        };
        if let Some((connection, thread_id, turn_id, interrupt_requested)) = interrupt_target {
            if !claim_turn_interrupt(&interrupt_requested) {
                return;
            }
            drop(tauri::async_runtime::spawn_blocking(move || {
                let _ = connection.request(
                    "turn/interrupt",
                    json!({"threadId": thread_id, "turnId": turn_id}),
                    RPC_TIMEOUT,
                );
            }));
        }
    }
}

impl Drop for CodexAssistantStore {
    fn drop(&mut self) {
        if let Ok(state) = self.state.get_mut() {
            if let Some(connection) = state.connection.take() {
                let first = connection.close();
                if first.needs_retry() {
                    let _ = connection.close();
                }
            }
        }
        if let Ok(retired) = self.retired_connections.get_mut() {
            for connection in std::mem::take(retired) {
                let first = connection.close();
                if first.needs_retry() {
                    let _ = connection.close();
                }
            }
        }
    }
}

fn retry_retired_connections_async(app: &AppHandle) {
    let app = app.clone();
    drop(tauri::async_runtime::spawn_blocking(move || {
        app.state::<CodexAssistantStore>()
            .retry_retired_connections();
    }));
}

async fn close_connection_for_app(
    app: &AppHandle,
    connection: Arc<AppServerConnection>,
) -> ConnectionCloseOutcome {
    let app = app.clone();
    let store_app = app.clone();
    let fallback = Arc::clone(&connection);
    match tauri::async_runtime::spawn_blocking(move || {
        store_app
            .state::<CodexAssistantStore>()
            .close_or_retain(connection)
    })
    .await
    {
        Ok(outcome) => outcome,
        Err(_) => {
            app.state::<CodexAssistantStore>()
                .retain_connection(fallback);
            ConnectionCloseOutcome::default()
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct RpcFailure {
    code: &'static str,
}

impl RpcFailure {
    fn new(code: &'static str) -> Self {
        Self { code }
    }
}

struct AppServerConnection {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    pending: Mutex<HashMap<u64, mpsc::SyncSender<Result<Value, RpcFailure>>>>,
    notifications: Mutex<mpsc::Receiver<Value>>,
    next_id: AtomicU64,
    disconnected: AtomicBool,
    stdout_thread: Mutex<Option<thread::JoinHandle<()>>>,
    stderr_thread: Mutex<Option<thread::JoinHandle<()>>>,
    stderr_capture: Arc<Mutex<Vec<u8>>>,
    stderr_truncated: Arc<AtomicBool>,
    runtime_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct ConnectionCloseOutcome {
    exit_confirmed: bool,
    stdin_closed: bool,
    kill_requested: bool,
    stdout_joined: bool,
    stderr_joined: bool,
    runtime_removed: bool,
}

impl ConnectionCloseOutcome {
    fn needs_retry(self) -> bool {
        !self.exit_confirmed || !self.stdout_joined || !self.stderr_joined || !self.runtime_removed
    }
}

fn parse_protocol_message(bytes: &mut Vec<u8>, total: &mut usize) -> Result<Value, RpcFailure> {
    *total = total.saturating_add(bytes.len());
    if bytes.len() > MAX_RPC_LINE_BYTES || *total > MAX_RPC_TOTAL_BYTES {
        return Err(RpcFailure::new("ai_protocol_message_too_large"));
    }
    while matches!(bytes.last(), Some(b'\r' | b'\n')) {
        bytes.pop();
    }
    let text =
        std::str::from_utf8(bytes).map_err(|_| RpcFailure::new("ai_protocol_message_invalid"))?;
    let value = serde_json::from_str::<Value>(text)
        .map_err(|_| RpcFailure::new("ai_protocol_message_invalid"))?;
    if !value.is_object() {
        return Err(RpcFailure::new("ai_protocol_message_invalid"));
    }
    Ok(value)
}

impl AppServerConnection {
    fn start(executable: &CodexExecutable, runtime_dir: &Path) -> Result<Arc<Self>, RpcFailure> {
        if !runtime_dir.is_dir()
            || fs::read_dir(runtime_dir)
                .map_err(|_| RpcFailure::new("codex_app_server_start_failed"))?
                .next()
                .is_some()
        {
            return Err(RpcFailure::new("codex_app_server_start_failed"));
        }
        verify_codex_identity(executable)?;
        let mut command = Command::new(&executable.path);
        command
            .arg("app-server")
            .arg("--stdio")
            .current_dir(runtime_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        apply_codex_environment(&mut command);
        let mut child = command
            .spawn()
            .map_err(|_| RpcFailure::new("codex_app_server_start_failed"))?;
        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            let _ = child.kill();
            let _ = Self::wait_for_exit(&mut child, Instant::now() + PROCESS_STOP_TIMEOUT);
            return Err(RpcFailure::new("codex_app_server_start_failed"));
        };
        let (notification_tx, notification_rx) = mpsc::channel();
        let connection = Arc::new(Self {
            child: Mutex::new(Some(child)),
            stdin: Mutex::new(Some(stdin)),
            pending: Mutex::new(HashMap::new()),
            notifications: Mutex::new(notification_rx),
            next_id: AtomicU64::new(1),
            disconnected: AtomicBool::new(false),
            stdout_thread: Mutex::new(None),
            stderr_thread: Mutex::new(None),
            stderr_capture: Arc::new(Mutex::new(Vec::new())),
            stderr_truncated: Arc::new(AtomicBool::new(false)),
            runtime_dir: runtime_dir.to_path_buf(),
        });
        let weak = Arc::downgrade(&connection);
        let stdout_handle = thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut total = 0usize;
            loop {
                let mut bytes = Vec::new();
                match reader.read_until(b'\n', &mut bytes) {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(_) => {
                        let _ = notification_tx.send(json!({
                            "method": "__protocol_error",
                            "params": {"code": "ai_protocol_message_invalid"}
                        }));
                        break;
                    }
                }
                let value = match parse_protocol_message(&mut bytes, &mut total) {
                    Ok(value) => value,
                    Err(error) => {
                        let _ = notification_tx.send(json!({
                            "method": "__protocol_error",
                            "params": {"code": error.code}
                        }));
                        break;
                    }
                };
                if let Some(id) = value.get("id").and_then(Value::as_u64) {
                    if value.get("method").is_some() {
                        if let Some(connection) = weak.upgrade() {
                            let _ = connection.write_message(&json!({
                                "id": id,
                                "error": {"code": -32601, "message": "Client request unsupported"}
                            }));
                        }
                        let _ = notification_tx.send(json!({
                            "method": "__server_request_blocked",
                            "params": {"category": "approval_or_permission_request"}
                        }));
                        continue;
                    }
                    if let Some(connection) = weak.upgrade() {
                        if let Some(sender) = connection
                            .pending
                            .lock()
                            .expect("pending request mutex poisoned")
                            .remove(&id)
                        {
                            let _ = sender.send(Ok(value));
                            continue;
                        }
                    }
                    let _ = notification_tx.send(json!({
                        "method": "__protocol_error",
                        "params": {"code": "ai_protocol_message_invalid"}
                    }));
                    continue;
                }
                let _ = notification_tx.send(value);
            }
            if let Some(connection) = weak.upgrade() {
                connection.disconnected.store(true, Ordering::Release);
                let pending = std::mem::take(
                    &mut *connection
                        .pending
                        .lock()
                        .expect("pending request mutex poisoned"),
                );
                for (_, sender) in pending {
                    let _ = sender.send(Err(RpcFailure::new("codex_app_server_disconnected")));
                }
            }
        });
        *connection
            .stdout_thread
            .lock()
            .expect("stdout thread mutex poisoned") = Some(stdout_handle);
        let capture = Arc::clone(&connection.stderr_capture);
        let truncated = Arc::clone(&connection.stderr_truncated);
        let stderr_handle = thread::spawn(move || {
            let mut stream = stderr;
            let mut buffer = [0u8; 4096];
            while let Ok(count) = stream.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let mut bytes = capture.lock().expect("stderr capture mutex poisoned");
                let room = MAX_STDERR_BYTES.saturating_sub(bytes.len());
                let copied = room.min(count);
                bytes.extend_from_slice(&buffer[..copied]);
                if copied < count {
                    truncated.store(true, Ordering::Release);
                }
            }
        });
        *connection
            .stderr_thread
            .lock()
            .expect("stderr thread mutex poisoned") = Some(stderr_handle);
        Ok(connection)
    }

    fn write_message(&self, value: &Value) -> Result<(), RpcFailure> {
        let mut bytes = serde_json::to_vec(value)
            .map_err(|_| RpcFailure::new("ai_protocol_message_invalid"))?;
        if bytes.len() > MAX_RPC_LINE_BYTES {
            return Err(RpcFailure::new("ai_protocol_message_too_large"));
        }
        bytes.push(b'\n');
        let mut stdin = self.stdin.lock().expect("Codex stdin mutex poisoned");
        let stream = stdin
            .as_mut()
            .ok_or_else(|| RpcFailure::new("codex_app_server_disconnected"))?;
        stream
            .write_all(&bytes)
            .and_then(|_| stream.flush())
            .map_err(|_| RpcFailure::new("codex_app_server_disconnected"))
    }

    fn is_healthy(&self) -> bool {
        if self.disconnected.load(Ordering::Acquire) {
            return false;
        }
        let healthy = self
            .child
            .lock()
            .expect("Codex child mutex poisoned")
            .as_mut()
            .is_some_and(|child| matches!(child.try_wait(), Ok(None)));
        if !healthy {
            self.disconnected.store(true, Ordering::Release);
        }
        healthy
    }

    fn request(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, RpcFailure> {
        if !self.is_healthy() {
            return Err(RpcFailure::new("codex_app_server_disconnected"));
        }
        let id = self.next_id.fetch_add(1, Ordering::AcqRel);
        let (sender, receiver) = mpsc::sync_channel(1);
        self.pending
            .lock()
            .expect("pending request mutex poisoned")
            .insert(id, sender);
        if let Err(error) =
            self.write_message(&json!({"id": id, "method": method, "params": params}))
        {
            self.pending
                .lock()
                .expect("pending request mutex poisoned")
                .remove(&id);
            return Err(error);
        }
        let message = receiver.recv_timeout(timeout).map_err(|_| {
            self.pending
                .lock()
                .expect("pending request mutex poisoned")
                .remove(&id);
            RpcFailure::new("codex_app_server_disconnected")
        })??;
        if message.get("id").and_then(Value::as_u64) != Some(id) {
            return Err(RpcFailure::new("ai_protocol_message_invalid"));
        }
        if message.get("error").is_some() {
            return Err(RpcFailure::new("codex_app_server_incompatible"));
        }
        message
            .get("result")
            .cloned()
            .ok_or_else(|| RpcFailure::new("ai_protocol_message_invalid"))
    }

    fn notify(&self, method: &str, params: Value) -> Result<(), RpcFailure> {
        self.write_message(&json!({"method": method, "params": params}))
    }

    fn next_notification(&self, timeout: Duration) -> Result<Option<Value>, RpcFailure> {
        match self
            .notifications
            .lock()
            .expect("notification mutex poisoned")
            .recv_timeout(timeout)
        {
            Ok(value) => Ok(Some(value)),
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err(RpcFailure::new("codex_app_server_disconnected"))
            }
        }
    }

    fn wait_for_exit(child: &mut Child, deadline: Instant) -> bool {
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return true,
                Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
                Ok(None) | Err(_) => return false,
            }
        }
    }

    fn join_stream_thread_bounded(
        handle_slot: &Mutex<Option<thread::JoinHandle<()>>>,
        deadline: Instant,
    ) -> bool {
        let mut handle = handle_slot
            .lock()
            .expect("stream thread mutex poisoned")
            .take();
        let Some(handle) = handle.take() else {
            return true;
        };
        while !handle.is_finished() && Instant::now() < deadline {
            thread::sleep(POLL_INTERVAL);
        }
        if handle.is_finished() {
            let _ = handle.join();
            true
        } else {
            *handle_slot.lock().expect("stream thread mutex poisoned") = Some(handle);
            false
        }
    }

    fn close(&self) -> ConnectionCloseOutcome {
        self.disconnected.store(true, Ordering::Release);
        let stdin = self
            .stdin
            .lock()
            .expect("Codex stdin mutex poisoned")
            .take();
        let stdin_closed = stdin.is_some();
        drop(stdin);
        let deadline = Instant::now() + PROCESS_STOP_TIMEOUT;
        let mut outcome = ConnectionCloseOutcome {
            stdin_closed,
            ..ConnectionCloseOutcome::default()
        };
        let mut child_guard = self.child.lock().expect("Codex child mutex poisoned");
        if let Some(child) = child_guard.as_mut() {
            outcome.exit_confirmed = Self::wait_for_exit(child, deadline);
            if !outcome.exit_confirmed {
                outcome.kill_requested = true;
                let _ = child.kill();
                outcome.exit_confirmed =
                    Self::wait_for_exit(child, Instant::now() + PROCESS_STOP_TIMEOUT);
            }
            if outcome.exit_confirmed {
                child_guard.take();
            }
        } else {
            outcome.exit_confirmed = true;
        }
        drop(child_guard);
        let stream_deadline = Instant::now() + STREAM_JOIN_TIMEOUT;
        outcome.stdout_joined =
            Self::join_stream_thread_bounded(&self.stdout_thread, stream_deadline);
        outcome.stderr_joined =
            Self::join_stream_thread_bounded(&self.stderr_thread, stream_deadline);
        if outcome.exit_confirmed && outcome.stdout_joined && outcome.stderr_joined {
            outcome.runtime_removed = match fs::remove_dir_all(&self.runtime_dir) {
                Ok(()) => true,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
                Err(_) => false,
            };
        }
        outcome
    }
}

fn apply_codex_environment(command: &mut Command) {
    let allowed = [
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOME",
        "LOCALAPPDATA",
        "APPDATA",
        "PATH",
        "PATHEXT",
        "USERNAME",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
        "ALL_PROXY",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ];
    command.env_clear();
    for name in allowed {
        if let Some(value) = env::var_os(name) {
            command.env(name, value);
        }
    }
}

fn safe_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn safe_language(value: &str) -> bool {
    matches!(value, "zh-CN" | "en")
}

fn official_codex_install_path(local_app_data: &Path) -> PathBuf {
    local_app_data
        .join("Programs")
        .join("OpenAI")
        .join("Codex")
        .join("bin")
        .join("codex.exe")
}

fn discover_codex() -> Result<(PathBuf, String), AiDiagnostic> {
    discover_codex_from(
        env::var_os(CODEX_ENVIRONMENT_VARIABLE),
        env::var_os("PATH"),
        env::var_os("LOCALAPPDATA"),
    )
}

fn discover_codex_from(
    configured: Option<OsString>,
    process_path: Option<OsString>,
    local_app_data: Option<OsString>,
) -> Result<(PathBuf, String), AiDiagnostic> {
    if let Some(value) = configured {
        let path = PathBuf::from(value);
        if !path.is_absolute()
            || !path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("codex.exe"))
        {
            return Err(AiDiagnostic::new(
                "codex_cli_invalid",
                "The configured Codex executable is invalid.",
            ));
        }
        let canonical = fs::canonicalize(&path).map_err(|_| {
            AiDiagnostic::new(
                "codex_cli_not_found",
                "The configured Codex executable was not found.",
            )
        })?;
        if !canonical.is_file() {
            return Err(AiDiagnostic::new(
                "codex_cli_invalid",
                "The configured Codex executable is invalid.",
            ));
        }
        return Ok((canonical, "environment".to_string()));
    }
    if let Some(root) = local_app_data {
        let candidate = official_codex_install_path(Path::new(&root));
        if candidate.is_file() {
            if let Ok(canonical) = fs::canonicalize(candidate) {
                return Ok((canonical, "official_install".to_string()));
            }
        }
    }
    let path = process_path.unwrap_or_default();
    for directory in env::split_paths(&path) {
        let candidate = directory.join("codex.exe");
        if candidate.is_file() {
            if let Ok(canonical) = fs::canonicalize(candidate) {
                return Ok((canonical, "path".to_string()));
            }
        }
    }
    Err(AiDiagnostic::new(
        "codex_cli_not_found",
        "Codex CLI was not found.",
    ))
}

fn capture_limited<R: Read + Send + 'static>(
    mut stream: R,
    limit: usize,
) -> thread::JoinHandle<(Vec<u8>, bool)> {
    thread::spawn(move || {
        let mut retained = Vec::new();
        let mut truncated = false;
        let mut buffer = [0u8; 4096];
        while let Ok(count) = stream.read(&mut buffer) {
            if count == 0 {
                break;
            }
            let room = limit.saturating_sub(retained.len());
            let copied = room.min(count);
            retained.extend_from_slice(&buffer[..copied]);
            truncated |= copied < count;
        }
        (retained, truncated)
    })
}

type CaptureResult = (Vec<u8>, bool);
type CapturePair = (CaptureResult, CaptureResult);

fn join_capture_pair_bounded(
    first: thread::JoinHandle<(Vec<u8>, bool)>,
    second: thread::JoinHandle<(Vec<u8>, bool)>,
    timeout: Duration,
) -> Option<CapturePair> {
    let deadline = Instant::now() + timeout;
    while (!first.is_finished() || !second.is_finished()) && Instant::now() < deadline {
        thread::sleep(POLL_INTERVAL);
    }
    if !first.is_finished() || !second.is_finished() {
        return None;
    }
    Some((first.join().ok()?, second.join().ok()?))
}

fn wait_for_child_exit(child: &mut Child, timeout: Duration) -> Option<ExitStatus> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            _ => return None,
        }
    }
}

fn prepare_runtime_dir(root: &Path, request_id: &str) -> Result<PathBuf, AiDiagnostic> {
    fs::create_dir_all(root).map_err(|_| {
        AiDiagnostic::new(
            "codex_app_server_start_failed",
            "The controlled AI runtime directory is unavailable.",
        )
    })?;
    let runtime_dir = root.join(format!("session-{request_id}"));
    fs::create_dir(&runtime_dir).map_err(|_| {
        AiDiagnostic::new(
            "codex_app_server_start_failed",
            "A fresh AI runtime directory could not be created.",
        )
    })?;
    Ok(runtime_dir)
}

fn probe_codex_executable(probe_dir: &Path) -> Result<CodexExecutable, AiDiagnostic> {
    let (path, source) = discover_codex()?;
    probe_codex_at(path, source, probe_dir)
}

fn probe_codex_presence(probe_dir: &Path) -> Result<CodexCliProbeView, AiDiagnostic> {
    let (path, source) = discover_codex()?;
    let before = fs::metadata(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI could not be inspected."))?;
    if !before.is_file() {
        return Err(AiDiagnostic::new(
            "codex_cli_invalid",
            "Codex CLI could not be inspected.",
        ));
    }
    let version = probe_codex_version_at(&path, probe_dir)?;
    let after = fs::metadata(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI changed during probe."))?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return Err(AiDiagnostic::new(
            "codex_cli_invalid",
            "Codex CLI changed during probe.",
        ));
    }
    Ok(CodexCliProbeView {
        found: true,
        version: Some(version),
        source: Some(source),
    })
}

fn parse_codex_version(stdout: &[u8]) -> Result<String, AiDiagnostic> {
    let text = std::str::from_utf8(stdout)
        .ok()
        .map(str::trim)
        .filter(|text| text.is_ascii() && text.len() <= 96)
        .ok_or_else(|| {
            AiDiagnostic::new(
                "codex_cli_probe_failed",
                "Codex CLI version was not recognized.",
            )
        })?;
    let mut parts = text.split_ascii_whitespace();
    let product = parts.next().unwrap_or_default();
    let version = parts.next().unwrap_or_default();
    if !product.to_ascii_lowercase().contains("codex")
        || version.is_empty()
        || parts.next().is_some()
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+'))
    {
        return Err(AiDiagnostic::new(
            "codex_cli_probe_failed",
            "Codex CLI version was not recognized.",
        ));
    }
    Ok(version.to_string())
}

fn probe_codex_version_at(path: &Path, probe_dir: &Path) -> Result<String, AiDiagnostic> {
    let mut command = Command::new(path);
    command
        .arg("--version")
        .current_dir(probe_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_codex_environment(&mut command);
    let mut child = command.spawn().map_err(|_| {
        AiDiagnostic::new("codex_cli_probe_failed", "Codex CLI version probe failed.")
    })?;
    let stdout = capture_limited(
        child.stdout.take().expect("piped Codex probe stdout"),
        MAX_PROBE_STREAM_BYTES,
    );
    let stderr = capture_limited(
        child.stderr.take().expect("piped Codex probe stderr"),
        MAX_PROBE_STREAM_BYTES,
    );
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let mut wait_failed = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            Ok(None) => {
                break if child.kill().is_ok() {
                    wait_for_child_exit(&mut child, PROCESS_STOP_TIMEOUT)
                } else {
                    None
                };
            }
            Err(_) => {
                wait_failed = true;
                break if child.kill().is_ok() {
                    wait_for_child_exit(&mut child, PROCESS_STOP_TIMEOUT)
                } else {
                    None
                };
            }
        }
    };
    let Some(((stdout, stdout_truncated), (_, stderr_truncated))) =
        join_capture_pair_bounded(stdout, stderr, PROCESS_STOP_TIMEOUT)
    else {
        return Err(AiDiagnostic::new(
            "codex_cli_probe_failed",
            "Codex CLI version probe failed.",
        ));
    };
    if wait_failed
        || status.is_none_or(|status| !status.success())
        || stdout_truncated
        || stderr_truncated
    {
        return Err(AiDiagnostic::new(
            "codex_cli_probe_failed",
            "Codex CLI version probe failed.",
        ));
    }
    parse_codex_version(&stdout)
}

fn probe_codex_at(
    path: PathBuf,
    source: String,
    probe_dir: &Path,
) -> Result<CodexExecutable, AiDiagnostic> {
    let before = fs::metadata(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI could not be inspected."))?;
    let (before_sha256, before_size) = sha256_file(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI could not be inspected."))?;
    if before_size != before.len() {
        return Err(AiDiagnostic::new(
            "codex_cli_invalid",
            "Codex CLI changed during probe.",
        ));
    }
    let version = probe_codex_version_at(&path, probe_dir)?;
    let after = fs::metadata(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI changed during probe."))?;
    let (after_sha256, after_size) = sha256_file(&path)
        .map_err(|_| AiDiagnostic::new("codex_cli_invalid", "Codex CLI changed during probe."))?;
    if before.len() != after.len()
        || before_size != after_size
        || before_sha256 != after_sha256
        || before.modified().ok() != after.modified().ok()
    {
        return Err(AiDiagnostic::new(
            "codex_cli_invalid",
            "Codex CLI changed during probe.",
        ));
    }
    Ok(CodexExecutable {
        path,
        version,
        source,
        sha256: after_sha256,
        size_bytes: after_size,
        modified: after.modified().ok(),
    })
}

fn verify_codex_identity(executable: &CodexExecutable) -> Result<(), RpcFailure> {
    let metadata =
        fs::metadata(&executable.path).map_err(|_| RpcFailure::new("codex_cli_invalid"))?;
    let (sha256, size_bytes) =
        sha256_file(&executable.path).map_err(|_| RpcFailure::new("codex_cli_invalid"))?;
    if !metadata.is_file()
        || size_bytes != executable.size_bytes
        || sha256 != executable.sha256
        || metadata.modified().ok() != executable.modified
    {
        return Err(RpcFailure::new("codex_cli_invalid"));
    }
    Ok(())
}

fn installer_wrapper_script() -> String {
    format!(
        "$ErrorActionPreference = 'Stop'\r\n\
$ProgressPreference = 'SilentlyContinue'\r\n\
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12\r\n\
$installerPath = Join-Path -Path $PSScriptRoot -ChildPath 'official-install.ps1'\r\n\
Invoke-WebRequest -UseBasicParsing -Uri '{OFFICIAL_CODEX_INSTALLER_URL}' -OutFile $installerPath\r\n\
$installerFile = Get-Item -LiteralPath $installerPath\r\n\
if ($installerFile.Length -gt {MAX_INSTALLER_SCRIPT_BYTES}) {{ exit 21 }}\r\n\
$installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToUpperInvariant()\r\n\
if ($installerHash -ne '{OFFICIAL_CODEX_INSTALLER_SHA256}') {{ exit 22 }}\r\n\
$env:CODEX_NON_INTERACTIVE = '1'\r\n\
& $installerPath\r\n\
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {{ exit $LASTEXITCODE }}\r\n\
exit 0\r\n"
    )
}

fn powershell_executable() -> Result<PathBuf, AiDiagnostic> {
    let system_root = env::var_os("SystemRoot").ok_or_else(|| {
        AiDiagnostic::new(
            "codex_cli_install_failed",
            "Windows PowerShell is unavailable for the controlled installation.",
        )
    })?;
    let path = PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    let canonical = fs::canonicalize(path).map_err(|_| {
        AiDiagnostic::new(
            "codex_cli_install_failed",
            "Windows PowerShell is unavailable for the controlled installation.",
        )
    })?;
    if !canonical.is_file()
        || !canonical
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("powershell.exe"))
    {
        return Err(AiDiagnostic::new(
            "codex_cli_install_failed",
            "Windows PowerShell is unavailable for the controlled installation.",
        ));
    }
    Ok(canonical)
}

fn installer_exit_diagnostic(code: Option<i32>, timed_out: bool) -> AiDiagnostic {
    if timed_out {
        return AiDiagnostic::new(
            "codex_cli_install_timeout",
            "The controlled Codex CLI installation timed out.",
        );
    }
    if matches!(code, Some(21 | 22)) {
        return AiDiagnostic::new(
            "codex_cli_installer_unsupported",
            "The official Codex installer no longer matches the reviewed identity.",
        );
    }
    AiDiagnostic::new(
        "codex_cli_install_failed",
        "The controlled Codex CLI installation failed.",
    )
}

fn run_official_installer(install_dir: &Path) -> Result<(), AiDiagnostic> {
    fs::create_dir(install_dir).map_err(|_| {
        AiDiagnostic::new(
            "codex_cli_install_failed",
            "A fresh controlled installer directory could not be created.",
        )
    })?;
    let wrapper_path = install_dir.join("install-official-codex.ps1");
    let mut wrapper = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&wrapper_path)
        .map_err(|_| {
            AiDiagnostic::new(
                "codex_cli_install_failed",
                "The controlled installer could not be prepared.",
            )
        })?;
    wrapper
        .write_all(installer_wrapper_script().as_bytes())
        .and_then(|_| wrapper.flush())
        .and_then(|_| wrapper.sync_all())
        .map_err(|_| {
            AiDiagnostic::new(
                "codex_cli_install_failed",
                "The controlled installer could not be prepared.",
            )
        })?;

    let powershell = powershell_executable()?;
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&wrapper_path)
        .current_dir(install_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_codex_environment(&mut command);
    command.env("CODEX_NON_INTERACTIVE", "1");
    let mut child = command.spawn().map_err(|_| {
        AiDiagnostic::new(
            "codex_cli_install_failed",
            "The controlled Codex CLI installer could not be started.",
        )
    })?;
    let stdout = capture_limited(
        child.stdout.take().expect("piped installer stdout"),
        MAX_PROBE_STREAM_BYTES,
    );
    let stderr = capture_limited(
        child.stderr.take().expect("piped installer stderr"),
        MAX_PROBE_STREAM_BYTES,
    );
    let deadline = Instant::now() + INSTALL_TIMEOUT;
    let mut timed_out = false;
    let mut wait_failed = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            Ok(None) => {
                timed_out = true;
                break if child.kill().is_ok() {
                    wait_for_child_exit(&mut child, PROCESS_STOP_TIMEOUT)
                } else {
                    None
                };
            }
            Err(_) => {
                wait_failed = true;
                break if child.kill().is_ok() {
                    wait_for_child_exit(&mut child, PROCESS_STOP_TIMEOUT)
                } else {
                    None
                };
            }
        }
    };
    let capture = join_capture_pair_bounded(stdout, stderr, PROCESS_STOP_TIMEOUT);
    if capture.is_none() {
        return Err(AiDiagnostic::new(
            "codex_cli_install_failed",
            "The controlled installer stream capture did not finish.",
        ));
    }
    let ((_, stdout_truncated), (_, stderr_truncated)) =
        capture.expect("checked installer stream capture");
    if stdout_truncated || stderr_truncated {
        return Err(AiDiagnostic::new(
            "codex_cli_install_failed",
            "The controlled installer output exceeded its safety limit.",
        ));
    }
    if wait_failed || status.is_none_or(|status| !status.success()) {
        return Err(installer_exit_diagnostic(
            status.and_then(|status| status.code()),
            timed_out,
        ));
    }
    Ok(())
}

fn install_official_codex_cli_blocking(
    install_root: &Path,
    local_app_data: &Path,
) -> Result<CodexExecutable, AiDiagnostic> {
    run_official_installer(install_root)?;
    let executable_path = official_codex_install_path(local_app_data);
    if !executable_path.is_file() {
        return Err(AiDiagnostic::new(
            "codex_cli_install_verification_failed",
            "The installed Codex CLI could not be verified.",
        ));
    }
    probe_codex_at(
        fs::canonicalize(executable_path).map_err(|_| {
            AiDiagnostic::new(
                "codex_cli_install_verification_failed",
                "The installed Codex CLI could not be verified.",
            )
        })?,
        "official_install".to_string(),
        install_root,
    )
    .map_err(|_| {
        AiDiagnostic::new(
            "codex_cli_install_verification_failed",
            "The installed Codex CLI could not be verified.",
        )
    })
}

fn initialize_connection(connection: &AppServerConnection) -> Result<(), RpcFailure> {
    connection.request(
        "initialize",
        json!({
            "clientInfo": {
                "name": "contam_studio",
                "title": "CONTAM Studio",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true,
                "optOutNotificationMethods": [
                    "item/reasoning/summaryTextDelta",
                    "item/reasoning/summaryPartAdded",
                    "item/reasoning/textDelta",
                    "turn/plan/updated"
                ]
            }
        }),
        RPC_TIMEOUT,
    )?;
    connection.notify("initialized", json!({}))
}

fn read_account(connection: &AppServerConnection) -> Result<CodexAccountView, RpcFailure> {
    let value = connection.request("account/read", json!({"refreshToken": false}), RPC_TIMEOUT)?;
    parse_account_response(&value)
}

fn parse_account_response(value: &Value) -> Result<CodexAccountView, RpcFailure> {
    let account = value.get("account").filter(|value| value.is_object());
    let auth_mode = account
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .filter(|value| value.len() <= 40)
        .map(str::to_string);
    let plan_type = account
        .and_then(|value| value.get("planType"))
        .and_then(Value::as_str)
        .filter(|value| value.len() <= 40)
        .map(str::to_string);
    let authenticated = auth_mode.as_deref() == Some("chatgpt");
    if auth_mode.as_deref().is_some_and(|value| {
        !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    }) || plan_type.as_deref().is_some_and(|value| {
        !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    }) {
        return Err(RpcFailure::new("codex_account_read_failed"));
    }
    Ok(CodexAccountView {
        authenticated,
        auth_mode,
        plan_type,
        requires_login: !authenticated,
    })
}

fn read_models(connection: &AppServerConnection) -> Result<Vec<CodexModelView>, RpcFailure> {
    let mut models = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..4 {
        let value = connection.request(
            "model/list",
            json!({"cursor": cursor, "limit": 100, "includeHidden": false}),
            RPC_TIMEOUT,
        )?;
        cursor = append_model_page(&value, &mut models)?;
        if cursor.is_none() {
            break;
        }
    }
    if models.is_empty() || models.len() > 200 {
        return Err(RpcFailure::new("codex_model_catalog_failed"));
    }
    Ok(models)
}

fn append_model_page(
    value: &Value,
    models: &mut Vec<CodexModelView>,
) -> Result<Option<String>, RpcFailure> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?;
    for raw in data {
        if raw.get("hidden").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let model_id = raw
            .get("model")
            .or_else(|| raw.get("id"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 120)
            .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?;
        if !model_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
        {
            return Err(RpcFailure::new("codex_model_catalog_failed"));
        }
        let display_name = raw
            .get("displayName")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 160)
            .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?;
        let default_effort = raw
            .get("defaultReasoningEffort")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 40)
            .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?;
        let efforts = raw
            .get("supportedReasoningEfforts")
            .and_then(Value::as_array)
            .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?
            .iter()
            .map(|effort| {
                let id = effort
                    .get("reasoningEffort")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty() && value.len() <= 40)?;
                let description = effort
                    .get("description")
                    .and_then(Value::as_str)
                    .filter(|value| value.len() <= 240)
                    .unwrap_or_default();
                Some(CodexReasoningEffortView {
                    id: id.to_string(),
                    description: description.to_string(),
                })
            })
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| RpcFailure::new("codex_model_catalog_failed"))?;
        if efforts.is_empty() || !efforts.iter().any(|effort| effort.id == default_effort) {
            return Err(RpcFailure::new("codex_model_catalog_failed"));
        }
        models.push(CodexModelView {
            id: model_id.to_string(),
            display_name: display_name.to_string(),
            is_default: raw
                .get("isDefault")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            available: true,
            reasoning_efforts: efforts,
            default_reasoning_effort: default_effort.to_string(),
        });
    }
    let cursor = value
        .get("nextCursor")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .map(str::to_string);
    Ok(cursor)
}

fn diagnostic_from_rpc(error: RpcFailure, fallback: &'static str) -> AiDiagnostic {
    let code = if error.code.starts_with("codex_") || error.code.starts_with("ai_") {
        error.code
    } else {
        fallback
    };
    AiDiagnostic::new(code, "Codex App Server operation failed.")
}

fn canonical_scopes(scopes: Vec<String>) -> Result<Vec<String>, AiDiagnostic> {
    if scopes.is_empty() || scopes.len() > ALL_CONTEXT_SCOPES.len() {
        return Err(AiDiagnostic::new(
            "ai_context_scope_invalid",
            "AI context scopes were invalid.",
        ));
    }
    let mut unique = Vec::new();
    for allowed in ALL_CONTEXT_SCOPES {
        if scopes.iter().any(|scope| scope == allowed) {
            unique.push(allowed.to_string());
        }
    }
    if unique.len() != scopes.len() {
        return Err(AiDiagnostic::new(
            "ai_context_scope_invalid",
            "AI context scopes were invalid.",
        ));
    }
    Ok(unique)
}

fn context_fingerprint(
    trusted: &AiTrustedContext,
    scopes: &[String],
) -> Result<String, AiDiagnostic> {
    let bytes = serde_json::to_vec(&json!({
        "session": trusted.project_session_id,
        "revision": trusted.revision_id,
        "zone": trusted.zone_id,
        "scopes": scopes,
        "payload": trusted.payload,
    }))
    .map_err(|_| {
        AiDiagnostic::new(
            "ai_context_unavailable",
            "AI context could not be serialized.",
        )
    })?;
    if bytes.len() > MAX_CONTEXT_BYTES {
        return Err(AiDiagnostic::new(
            "ai_context_unavailable",
            "AI context exceeded the safe size limit.",
        ));
    }
    Ok(Uuid::new_v5(&CONTEXT_FINGERPRINT_NAMESPACE, &bytes).to_string())
}

fn build_trusted_context_with_attachments(
    app: &AppHandle,
    project_session_id: &str,
    revision_id: &str,
    zone_id: &str,
    scopes: &[String],
    language: &str,
    model_id: &str,
) -> Result<AiTrustedContext, AiDiagnostic> {
    let project_scopes = scopes
        .iter()
        .filter(|scope| scope.as_str() != "attachment_evidence")
        .cloned()
        .collect::<Vec<_>>();
    let project_store = app.state::<DesktopProjectSessionStore>();
    let mut trusted = project_store
        .build_ai_context(project_session_id, revision_id, zone_id, &project_scopes)
        .map_err(|error| AiDiagnostic::new(&error.code, &error.message))?;
    if scopes.iter().any(|scope| scope == "attachment_evidence") {
        let evidence = app
            .state::<AttachmentCenterStore>()
            .evidence_payload(project_session_id, revision_id, language, model_id)
            .map_err(|error| AiDiagnostic::new(&error.code, &error.message))?;
        let payload = trusted.payload.as_object_mut().ok_or_else(|| {
            AiDiagnostic::new("ai_context_unavailable", "AI context payload was invalid.")
        })?;
        payload.insert("attachment_evidence".to_owned(), evidence);
    }
    Ok(trusted)
}

fn archive_response_failure(
    request_id: String,
    error: AiDiagnostic,
) -> DesktopAiConversationArchiveResponse {
    DesktopAiConversationArchiveResponse {
        request_id,
        archive: None,
        error: Some(error),
    }
}

fn archive_action_failure(request_id: String, error: AiDiagnostic) -> DesktopAiActionResponse {
    DesktopAiActionResponse {
        request_id,
        status: "error".to_string(),
        error: Some(error),
    }
}

fn archive_error(code: &str, message: &str) -> AiDiagnostic {
    AiDiagnostic::new(code, message)
}

fn safe_archive_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.chars().count() <= maximum
        && !value.chars().any(char::is_control)
        && !contains_sensitive_path(value)
}

/// Archive content is deliberately stricter than a transient model response:
/// local history must never become another place for a user path to persist.
fn contains_sensitive_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.contains("\\\\")
        || value.to_ascii_lowercase().contains("file://")
        || bytes.windows(3).any(|window| {
            window[0].is_ascii_alphabetic()
                && window[1] == b':'
                && matches!(window[2], b'\\' | b'/')
        })
}

fn safe_archive_answer(answer: &StructuredAiAnswer) -> bool {
    answer
        .deterministic_facts
        .iter()
        .all(|item| safe_archive_text(item, MAX_RESPONSE_ITEM_CHARS))
        && safe_archive_text(&answer.interpretation, MAX_AGENT_RESPONSE_CHARS)
        && answer
            .limitations
            .iter()
            .all(|item| safe_archive_text(item, MAX_RESPONSE_ITEM_CHARS))
        && answer
            .suggested_questions
            .iter()
            .all(|item| safe_archive_text(item, MAX_RESPONSE_ITEM_CHARS))
}

fn safe_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn archive_file_path(app: &AppHandle) -> Result<PathBuf, AiDiagnostic> {
    app.path()
        .app_local_data_dir()
        .map(|path| {
            path.join("ai")
                .join("conversation-archive")
                .join("archive.json")
        })
        .map_err(|_| {
            archive_error(
                "ai_archive_unavailable",
                "The controlled local conversation archive is unavailable.",
            )
        })
}

fn validate_archive_entry(entry: &StoredAiConversationArchiveEntry) -> Result<(), AiDiagnostic> {
    if Uuid::parse_str(&entry.entry_id).is_err()
        || !safe_sha256(&entry.baseline_source_sha256)
        || Uuid::parse_str(&entry.revision_id).is_err()
        || Uuid::parse_str(&entry.zone_id).is_err()
        || Uuid::parse_str(&entry.context_fingerprint).is_err()
        || !safe_language(&entry.language)
        || !safe_archive_text(&entry.zone_name, 256)
        || !safe_archive_text(&entry.model_id, 160)
        || !safe_archive_text(&entry.reasoning_effort, 80)
        || !safe_archive_text(&entry.question, MAX_QUESTION_CHARS)
        || entry.included_scopes.is_empty()
    {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive contains invalid data.",
        ));
    }
    let scopes = canonical_scopes(entry.included_scopes.clone()).map_err(|_| {
        archive_error(
            "ai_archive_unavailable",
            "The local conversation archive contains invalid context scopes.",
        )
    })?;
    if scopes != entry.included_scopes {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive contains invalid context scopes.",
        ));
    }
    validate_answer(entry.answer.clone()).map_err(|_| {
        archive_error(
            "ai_archive_unavailable",
            "The local conversation archive contains an invalid AI answer.",
        )
    })?;
    if !safe_archive_answer(&entry.answer) {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive contains unsafe answer content.",
        ));
    }
    Ok(())
}

fn validate_archive_file(archive: &AiConversationArchiveFile) -> Result<(), AiDiagnostic> {
    if archive.schema_version != AI_CONVERSATION_ARCHIVE_SCHEMA_VERSION
        || archive.entries.len() > MAX_ARCHIVE_ENTRIES
    {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive format is unsupported.",
        ));
    }
    let mut seen = std::collections::HashSet::new();
    for entry in &archive.entries {
        validate_archive_entry(entry)?;
        if !seen.insert(entry.entry_id.as_str()) {
            return Err(archive_error(
                "ai_archive_unavailable",
                "The local conversation archive contains duplicate entries.",
            ));
        }
    }
    Ok(())
}

fn read_archive_file(path: &Path) -> Result<AiConversationArchiveFile, AiDiagnostic> {
    if !path.exists() {
        return Ok(AiConversationArchiveFile::default());
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        archive_error(
            "ai_archive_unavailable",
            "The local conversation archive could not be read.",
        )
    })?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_ARCHIVE_FILE_BYTES
    {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive is unavailable.",
        ));
    }
    let bytes = fs::read(path).map_err(|_| {
        archive_error(
            "ai_archive_unavailable",
            "The local conversation archive could not be read.",
        )
    })?;
    let archive: AiConversationArchiveFile = serde_json::from_slice(&bytes).map_err(|_| {
        archive_error(
            "ai_archive_unavailable",
            "The local conversation archive is invalid.",
        )
    })?;
    validate_archive_file(&archive)?;
    Ok(archive)
}

fn write_archive_file(
    path: &Path,
    archive: &AiConversationArchiveFile,
) -> Result<(), AiDiagnostic> {
    validate_archive_file(archive)?;
    let parent = path.parent().ok_or_else(|| {
        archive_error(
            "ai_archive_write_failed",
            "The local conversation archive destination is invalid.",
        )
    })?;
    fs::create_dir_all(parent).map_err(|_| {
        archive_error(
            "ai_archive_write_failed",
            "The controlled local conversation archive could not be created.",
        )
    })?;
    let bytes = serde_json::to_vec_pretty(archive).map_err(|_| {
        archive_error(
            "ai_archive_write_failed",
            "The local conversation archive could not be serialized.",
        )
    })?;
    if bytes.len() as u64 > MAX_ARCHIVE_FILE_BYTES {
        return Err(archive_error(
            "ai_archive_write_failed",
            "The local conversation archive exceeded its safe size limit.",
        ));
    }
    let temporary_sequence = ARCHIVE_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(
        ".archive-{}-{}-{}.tmp",
        std::process::id(),
        temporary_timestamp,
        temporary_sequence
    ));
    let write_result = (|| -> Result<(), AiDiagnostic> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| {
                archive_error(
                    "ai_archive_write_failed",
                    "The local conversation archive could not be written.",
                )
            })?;
        file.write_all(&bytes).map_err(|_| {
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive could not be written.",
            )
        })?;
        file.sync_all().map_err(|_| {
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive could not be synchronized.",
            )
        })?;
        fs::rename(&temporary, path).map_err(|_| {
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive could not be finalized.",
            )
        })?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn archive_view_for_context(
    archive: &AiConversationArchiveFile,
    trusted: &AiTrustedContext,
) -> AiConversationArchiveView {
    let mut entries: Vec<_> = archive
        .entries
        .iter()
        .filter(|entry| {
            entry
                .baseline_source_sha256
                .eq_ignore_ascii_case(&trusted.baseline_source_sha256)
                && entry.zone_id == trusted.zone_id
        })
        .map(|entry| AiArchivedConversationEntryView {
            entry_id: entry.entry_id.clone(),
            revision_id: entry.revision_id.clone(),
            revision_number: entry.revision_number,
            zone_id: entry.zone_id.clone(),
            zone_name: entry.zone_name.clone(),
            language: entry.language.clone(),
            model_id: entry.model_id.clone(),
            reasoning_effort: entry.reasoning_effort.clone(),
            included_scopes: entry.included_scopes.clone(),
            completed_at_unix_ms: entry.completed_at_unix_ms,
            is_current_revision: entry.revision_id == trusted.revision_id,
            question: entry.question.clone(),
            answer: entry.answer.clone(),
        })
        .collect();
    entries.sort_by_key(|entry| Reverse(entry.completed_at_unix_ms));
    AiConversationArchiveView {
        persistence_enabled: archive.persistence_enabled,
        entries,
    }
}

fn archive_now_unix_ms() -> Result<u64, AiDiagnostic> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive timestamp is unavailable.",
            )
        })
        .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX))
}

struct ArchiveSaveCompletedTurnInput<'a> {
    store: &'a AiConversationArchiveStore,
    path: &'a Path,
    trusted: &'a AiTrustedContext,
    preview: &'a AiContextDisclosureView,
    language: &'a str,
    model_id: &'a str,
    reasoning_effort: &'a str,
    question: &'a str,
    answer: &'a StructuredAiAnswer,
}

fn archive_save_completed_turn(input: ArchiveSaveCompletedTurnInput<'_>) -> AiArchiveSaveView {
    let ArchiveSaveCompletedTurnInput {
        store,
        path,
        trusted,
        preview,
        language,
        model_id,
        reasoning_effort,
        question,
        answer,
    } = input;
    let _gate = store
        .operation_gate
        .lock()
        .expect("AI conversation archive mutex poisoned");
    let result = (|| -> Result<Option<String>, AiDiagnostic> {
        let mut archive = read_archive_file(path)?;
        if !archive.persistence_enabled {
            return Ok(None);
        }
        let completed_at_unix_ms = archive_now_unix_ms()?;
        let sequence = ARCHIVE_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let entry_id = Uuid::new_v5(
            &AI_CONVERSATION_ARCHIVE_NAMESPACE,
            format!(
                "{}:{}:{}:{}:{}:{}",
                trusted.baseline_source_sha256,
                trusted.revision_id,
                trusted.zone_id,
                preview.context_fingerprint,
                completed_at_unix_ms,
                sequence,
            )
            .as_bytes(),
        )
        .to_string();
        let entry = StoredAiConversationArchiveEntry {
            entry_id: entry_id.clone(),
            baseline_source_sha256: trusted.baseline_source_sha256.clone(),
            revision_id: trusted.revision_id.clone(),
            revision_number: trusted.revision_number,
            zone_id: trusted.zone_id.clone(),
            zone_name: trusted.zone_name.clone(),
            context_fingerprint: preview.context_fingerprint.clone(),
            language: language.to_string(),
            model_id: model_id.to_string(),
            reasoning_effort: reasoning_effort.to_string(),
            included_scopes: preview.included_scopes.clone(),
            completed_at_unix_ms,
            question: question.trim().to_string(),
            answer: answer.clone(),
        };
        validate_archive_entry(&entry)?;
        archive.entries.push(entry);
        if archive.entries.len() > MAX_ARCHIVE_ENTRIES {
            let excess = archive.entries.len() - MAX_ARCHIVE_ENTRIES;
            archive.entries.drain(0..excess);
        }
        write_archive_file(path, &archive)?;
        Ok(Some(entry_id))
    })();
    match result {
        Ok(Some(entry_id)) => AiArchiveSaveView {
            saved: true,
            entry_id: Some(entry_id),
            warning: None,
        },
        Ok(None) => AiArchiveSaveView::default(),
        Err(error) => AiArchiveSaveView {
            saved: false,
            entry_id: None,
            warning: Some(error),
        },
    }
}

struct PersistCompletedAiAnswerInput {
    trusted: AiTrustedContext,
    preview: AiContextDisclosureView,
    language: String,
    model_id: String,
    reasoning_effort: String,
    question: String,
    answer: StructuredAiAnswer,
}

async fn persist_completed_ai_answer(
    app: &AppHandle,
    input: PersistCompletedAiAnswerInput,
) -> AiArchiveSaveView {
    let PersistCompletedAiAnswerInput {
        trusted,
        preview,
        language,
        model_id,
        reasoning_effort,
        question,
        answer,
    } = input;
    let path = match archive_file_path(app) {
        Ok(path) => path,
        Err(error) => {
            return AiArchiveSaveView {
                saved: false,
                entry_id: None,
                warning: Some(error),
            }
        }
    };
    let app_for_task = app.clone();
    match tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
            store: &store,
            path: &path,
            trusted: &trusted,
            preview: &preview,
            language: &language,
            model_id: &model_id,
            reasoning_effort: &reasoning_effort,
            question: &question,
            answer: &answer,
        })
    })
    .await
    {
        Ok(view) => view,
        Err(_) => AiArchiveSaveView {
            saved: false,
            entry_id: None,
            warning: Some(archive_error(
                "ai_archive_write_failed",
                "The local conversation archive task failed.",
            )),
        },
    }
}

#[allow(clippy::too_many_arguments)]
fn preview_matches_turn(
    preview: &AiPreviewRecord,
    preview_id: &str,
    project_session_id: &str,
    revision_id: &str,
    zone_id: &str,
    scopes: &[String],
    language: &str,
    model_id: &str,
    reasoning_effort: &str,
) -> bool {
    preview.view.preview_id == preview_id
        && preview.view.project_session_id == project_session_id
        && preview.view.revision_id == revision_id
        && preview.view.zone_id == zone_id
        && preview.view.included_scopes == scopes
        && preview.language == language
        && preview.model_id == model_id
        && preview.reasoning_effort == reasoning_effort
}

fn connection_view(state: &AssistantState) -> Option<CodexConnectionView> {
    let connection = state.connection.as_ref()?;
    if !connection.is_healthy() {
        return None;
    }
    let cli = state.cli.clone()?;
    let account = state.account.clone()?;
    Some(CodexConnectionView {
        status: if account.authenticated {
            "available"
        } else {
            "not_authenticated"
        }
        .to_string(),
        cli,
        account,
        models: state.models.clone(),
    })
}

fn thread_system_instructions(language: &str) -> String {
    let language_name = if language == "zh-CN" {
        "Simplified Chinese"
    } else {
        "English"
    };
    format!(
        "You are the strictly read-only CONTAM Studio explanation assistant. Use only the structured context included in user messages. Do not read files, run commands, call tools, use web search, modify a project, run ContamX, create patches, or claim access to undisclosed data. Answer in {language_name}. Separate deterministic facts from interpretation. State uncertainty and limitations. Do not provide regulatory compliance or health-risk conclusions. Never claim that you modified, ran, or verified the project. The complete result series is not disclosed unless explicitly stated; do not claim curve-wide analysis."
    )
}

fn thread_start_params(model_id: &str, runtime_dir: &Path, language: &str) -> Value {
    json!({
        "model": model_id,
        "cwd": runtime_dir,
        "approvalPolicy": "never",
        "sandbox": "read-only",
        "config": {"mcp_servers": {}},
        "baseInstructions": thread_system_instructions(language),
        "developerInstructions": thread_system_instructions(language),
        "ephemeral": true,
        "environments": [],
        "dynamicTools": [],
        "selectedCapabilityRoots": [],
        "experimentalRawEvents": false
    })
}

fn canonical_paths_equal(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn validate_readonly_thread_response(
    response: &Value,
    runtime_dir: &Path,
) -> Result<String, RpcFailure> {
    let thread_id = response
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 128)
        .ok_or_else(|| RpcFailure::new("codex_app_server_incompatible"))?;
    let returned_cwd = response
        .get("cwd")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 4096)
        .ok_or_else(|| RpcFailure::new("codex_app_server_incompatible"))?;
    let sandbox = response.pointer("/sandbox/type").and_then(Value::as_str);
    let network_access = response
        .pointer("/sandbox/networkAccess")
        .and_then(Value::as_bool);
    let approval = response.get("approvalPolicy").and_then(Value::as_str);
    let instruction_sources_valid = match response.get("instructionSources") {
        None => true,
        Some(Value::Array(sources)) => sources.iter().all(|source| {
            source
                .as_str()
                .is_some_and(|value| !value.is_empty() && value.len() <= 4096)
        }),
        _ => false,
    };
    let runtime_workspace_roots_confined = match response.get("runtimeWorkspaceRoots") {
        None | Some(Value::Null) => true,
        Some(Value::Array(roots)) => {
            roots.len() <= 1
                && roots.iter().all(|root| {
                    root.as_str().is_some_and(|value| {
                        !value.is_empty()
                            && value.len() <= 4096
                            && canonical_paths_equal(Path::new(value), runtime_dir)
                    })
                })
        }
        _ => false,
    };

    // App Server can report inherited process-level instruction paths. They are not
    // project context, so Studio never reads, retains, or forwards them to the WebView.
    if sandbox != Some("readOnly")
        || network_access != Some(false)
        || approval != Some("never")
        || !canonical_paths_equal(Path::new(returned_cwd), runtime_dir)
        || !instruction_sources_valid
        || !runtime_workspace_roots_confined
    {
        return Err(RpcFailure::new("codex_readonly_mode_unavailable"));
    }
    Ok(thread_id.to_string())
}

#[allow(clippy::too_many_arguments)]
fn turn_start_params(
    thread_id: &str,
    request_id: &str,
    user_text: &str,
    model_id: &str,
    reasoning_effort: &str,
) -> Value {
    json!({
        "threadId": thread_id,
        "clientUserMessageId": request_id,
        "input": [{"type": "text", "text": user_text}],
        "approvalPolicy": "never",
        "sandboxPolicy": {"type": "readOnly", "networkAccess": false},
        "environments": [],
        "model": model_id,
        "effort": reasoning_effort,
        "summary": "none",
        "personality": "none",
        "outputSchema": answer_schema()
    })
}

fn answer_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "deterministic_facts": {
                "type": "array",
                "items": {"type": "string", "maxLength": MAX_RESPONSE_ITEM_CHARS},
                "maxItems": 8
            },
            "interpretation": {"type": "string", "maxLength": 4000},
            "limitations": {
                "type": "array",
                "items": {"type": "string", "maxLength": MAX_RESPONSE_ITEM_CHARS},
                "maxItems": 8
            },
            "suggested_questions": {
                "type": "array",
                "items": {"type": "string", "maxLength": MAX_RESPONSE_ITEM_CHARS},
                "maxItems": 6
            }
        },
        "required": ["deterministic_facts", "interpretation", "limitations", "suggested_questions"],
        "additionalProperties": false
    })
}

fn validate_answer(answer: StructuredAiAnswer) -> Result<StructuredAiAnswer, AiDiagnostic> {
    let arrays_valid = answer.deterministic_facts.len() <= 8
        && answer.limitations.len() <= 8
        && answer.suggested_questions.len() <= 6
        && answer
            .deterministic_facts
            .iter()
            .chain(&answer.limitations)
            .chain(&answer.suggested_questions)
            .all(|item| !item.trim().is_empty() && item.chars().count() <= MAX_RESPONSE_ITEM_CHARS);
    if !arrays_valid
        || answer.interpretation.trim().is_empty()
        || answer.interpretation.chars().count() > 4_000
    {
        return Err(AiDiagnostic::new(
            "ai_response_contract_invalid",
            "The AI response did not match the safe response contract.",
        ));
    }
    Ok(answer)
}

fn tool_event_category(value: &Value) -> Option<&'static str> {
    let method = value.get("method").and_then(Value::as_str)?;
    if method == "__server_request_blocked"
        || method.to_ascii_lowercase().contains("approval")
        || method.to_ascii_lowercase().contains("permission")
    {
        return Some("approval_or_permission_request");
    }
    if !matches!(method, "item/started" | "item/completed") {
        return None;
    }
    let item_type = value.pointer("/params/item/type").and_then(Value::as_str)?;
    TOOL_ITEM_TYPES.contains(&item_type).then_some("tool_item")
}

fn token_usage_from_notification(value: &Value) -> Option<AiTokenUsageView> {
    if value.get("method").and_then(Value::as_str) != Some("thread/tokenUsage/updated") {
        return None;
    }
    let usage = value
        .pointer("/params/tokenUsage/total")
        .or_else(|| value.pointer("/params/tokenUsage"))?;
    Some(AiTokenUsageView {
        input_tokens: usage.get("inputTokens").and_then(Value::as_u64),
        cached_input_tokens: usage.get("cachedInputTokens").and_then(Value::as_u64),
        output_tokens: usage.get("outputTokens").and_then(Value::as_u64),
        total_tokens: usage.get("totalTokens").and_then(Value::as_u64),
    })
}

#[derive(Default)]
struct TurnCollectionState {
    answer: String,
    tool_blocked: bool,
    token_usage: Option<AiTokenUsageView>,
}

enum TurnNotificationAction {
    Continue,
    InterruptForTool,
    Completed(String, Option<AiTokenUsageView>),
    Failed {
        error: RpcFailure,
        token_usage: Option<AiTokenUsageView>,
        completion_confirmed: bool,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TurnStopReason {
    UserInterrupted,
    TimedOut,
    ToolUseBlocked,
}

impl TurnStopReason {
    fn diagnostic_code(self) -> &'static str {
        match self {
            Self::UserInterrupted => "ai_turn_interrupted",
            Self::TimedOut => "ai_turn_start_failed",
            Self::ToolUseBlocked => "ai_tool_use_blocked",
        }
    }
}

fn claim_turn_interrupt(interrupt_requested: &AtomicBool) -> bool {
    !interrupt_requested.swap(true, Ordering::AcqRel)
}

#[derive(Debug)]
enum TurnWaitOutcome {
    Completed {
        answer: String,
        token_usage: Option<AiTokenUsageView>,
    },
    Failed {
        error: RpcFailure,
        token_usage: Option<AiTokenUsageView>,
        completion_confirmed: bool,
    },
}

fn turn_outcome_requires_connection_reset(outcome: &TurnWaitOutcome) -> bool {
    matches!(
        outcome,
        TurnWaitOutcome::Failed {
            completion_confirmed: false,
            ..
        }
    )
}

#[derive(Debug)]
struct TurnStartFailure {
    error: RpcFailure,
    turn_may_have_started: bool,
}

impl TurnStartFailure {
    fn before_turn(error: RpcFailure) -> Self {
        Self {
            error,
            turn_may_have_started: false,
        }
    }

    fn after_turn_attempt(error: RpcFailure) -> Self {
        Self {
            error,
            turn_may_have_started: true,
        }
    }
}

fn process_turn_notification(
    notification: &Value,
    expected_thread: &str,
    expected_turn: &str,
    state: &mut TurnCollectionState,
) -> TurnNotificationAction {
    let method = notification
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if method == "__protocol_error" {
        let code = if notification.pointer("/params/code").and_then(Value::as_str)
            == Some("ai_protocol_message_too_large")
        {
            "ai_protocol_message_too_large"
        } else {
            "ai_protocol_message_invalid"
        };
        return TurnNotificationAction::Failed {
            error: RpcFailure::new(code),
            token_usage: state.token_usage.clone(),
            completion_confirmed: false,
        };
    }
    let event_thread = notification
        .pointer("/params/threadId")
        .and_then(Value::as_str);
    let event_turn = notification
        .pointer("/params/turnId")
        .and_then(Value::as_str);
    if event_thread.is_some_and(|value| value != expected_thread)
        || event_turn.is_some_and(|value| value != expected_turn)
    {
        return TurnNotificationAction::Continue;
    }
    if let Some(usage) = token_usage_from_notification(notification) {
        state.token_usage = Some(usage);
        return TurnNotificationAction::Continue;
    }
    let global_server_request = method == "__server_request_blocked";
    if global_server_request || tool_event_category(notification).is_some() {
        state.tool_blocked = true;
        state.answer.clear();
        return TurnNotificationAction::InterruptForTool;
    }
    if method == "item/agentMessage/delta" && !state.tool_blocked {
        let Some(delta) = notification
            .pointer("/params/delta")
            .and_then(Value::as_str)
        else {
            return TurnNotificationAction::Failed {
                error: RpcFailure::new("ai_protocol_message_invalid"),
                token_usage: state.token_usage.clone(),
                completion_confirmed: false,
            };
        };
        if state
            .answer
            .chars()
            .count()
            .saturating_add(delta.chars().count())
            > MAX_AGENT_RESPONSE_CHARS
        {
            return TurnNotificationAction::Failed {
                error: RpcFailure::new("ai_response_too_large"),
                token_usage: state.token_usage.clone(),
                completion_confirmed: false,
            };
        }
        state.answer.push_str(delta);
    }
    if method == "turn/completed" {
        let status = notification
            .pointer("/params/turn/status")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let failure = if state.tool_blocked {
            Some("ai_tool_use_blocked")
        } else if status == "interrupted" {
            Some("ai_turn_interrupted")
        } else if status != "completed" {
            Some("ai_turn_start_failed")
        } else {
            None
        };
        if let Some(code) = failure {
            return TurnNotificationAction::Failed {
                error: RpcFailure::new(code),
                token_usage: state.token_usage.clone(),
                completion_confirmed: true,
            };
        }
        return TurnNotificationAction::Completed(
            std::mem::take(&mut state.answer),
            state.token_usage.clone(),
        );
    }
    TurnNotificationAction::Continue
}

fn preview_failure(request_id: String, error: AiDiagnostic) -> DesktopAiContextPreviewResponse {
    DesktopAiContextPreviewResponse {
        request_id,
        preview: None,
        error: Some(error),
    }
}

fn turn_failure(request_id: String, error: AiDiagnostic) -> DesktopAiTurnResponse {
    DesktopAiTurnResponse {
        request_id,
        status: "error".to_string(),
        answer: None,
        token_usage: None,
        archive: AiArchiveSaveView::default(),
        error: Some(error),
    }
}

fn clear_pending_turn(store: &CodexAssistantStore, request_id: &str) {
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    if state.active_turn_request_id.as_deref() == Some(request_id) {
        state.clear_active_turn();
    }
}

/// A turn-start timeout or an unconfirmed interrupt leaves the server-side turn
/// ambiguous. Detach the current connection before accepting another request so
/// a late event can never be attributed to a later CONTAM Studio turn.
fn detach_connection_after_unconfirmed_turn(
    store: &CodexAssistantStore,
    expected: &Arc<AppServerConnection>,
    request_id: &str,
) -> Option<Arc<AppServerConnection>> {
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    if state.has_connection(expected) {
        let connection = state.connection.take();
        state.clear_connection_catalog();
        return connection;
    }
    if state.active_turn_request_id.as_deref() == Some(request_id) {
        state.clear_active_turn();
    }
    None
}

#[tauri::command]
pub async fn install_official_codex_cli(
    app: AppHandle,
    request_id: String,
) -> DesktopCodexInstallResponse {
    if !safe_request_id(&request_id) {
        return DesktopCodexInstallResponse {
            request_id,
            status: "error".to_string(),
            probe: None,
            error: Some(AiDiagnostic::new(
                "codex_cli_install_failed",
                "The Codex install request was invalid.",
            )),
        };
    }
    retry_retired_connections_async(&app);
    let store = app.state::<CodexAssistantStore>();
    {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        if state.installing || state.connecting.is_some() || state.active_turn_request_id.is_some()
        {
            return DesktopCodexInstallResponse {
                request_id,
                status: "error".to_string(),
                probe: None,
                error: Some(AiDiagnostic::new(
                    "codex_cli_install_failed",
                    "Another Codex operation is active.",
                )),
            };
        }
        state.installing = true;
    }

    let app_local_data = app.path().app_local_data_dir();
    let local_app_data = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let result = match (app_local_data, local_app_data) {
        (Ok(app_local_data), Some(local_app_data)) if local_app_data.is_absolute() => {
            let install_root = app_local_data
                .join("ai")
                .join("codex-installer")
                .join(format!("install-{request_id}"));
            let cleanup_root = install_root.clone();
            let configured = env::var_os(CODEX_ENVIRONMENT_VARIABLE).is_some();
            let task = tauri::async_runtime::spawn_blocking(move || {
                if let Some(parent) = install_root.parent() {
                    fs::create_dir_all(parent).map_err(|_| {
                        AiDiagnostic::new(
                            "codex_cli_install_failed",
                            "The controlled installer directory is unavailable.",
                        )
                    })?;
                }
                if install_root.exists() {
                    return Err(AiDiagnostic::new(
                        "codex_cli_install_failed",
                        "A fresh controlled installer directory could not be created.",
                    ));
                }
                match probe_codex_executable(install_root.parent().unwrap_or(&install_root)) {
                    Ok(executable) => Ok(("already_available", executable)),
                    Err(error) if configured => Err(error),
                    Err(_) => install_official_codex_cli_blocking(&install_root, &local_app_data)
                        .map(|executable| ("installed", executable)),
                }
            })
            .await;
            let _ = fs::remove_dir_all(cleanup_root);
            match task {
                Ok(value) => value,
                Err(_) => Err(AiDiagnostic::new(
                    "codex_cli_install_failed",
                    "The controlled Codex CLI installation task failed.",
                )),
            }
        }
        _ => Err(AiDiagnostic::new(
            "codex_cli_install_failed",
            "The controlled installer directory is unavailable.",
        )),
    };

    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    state.installing = false;
    match result {
        Ok((status, executable)) => {
            let probe = CodexCliProbeView {
                found: true,
                version: Some(executable.version),
                source: Some(executable.source),
            };
            state.cli = Some(probe.clone());
            DesktopCodexInstallResponse {
                request_id,
                status: status.to_string(),
                probe: Some(probe),
                error: None,
            }
        }
        Err(error) => DesktopCodexInstallResponse {
            request_id,
            status: "error".to_string(),
            probe: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub async fn probe_codex_app_server(
    app: AppHandle,
    request_id: String,
) -> DesktopCodexProbeResponse {
    if !safe_request_id(&request_id) {
        return DesktopCodexProbeResponse {
            request_id,
            probe: None,
            error: Some(AiDiagnostic::new(
                "codex_cli_invalid",
                "The Codex probe request was invalid.",
            )),
        };
    }
    let root = match app.path().app_local_data_dir() {
        Ok(path) => path.join("ai").join("codex-runtime"),
        Err(_) => {
            return DesktopCodexProbeResponse {
                request_id,
                probe: None,
                error: Some(AiDiagnostic::new(
                    "codex_cli_probe_failed",
                    "The controlled AI runtime directory is unavailable.",
                )),
            }
        }
    };
    let runtime_dir = match prepare_runtime_dir(&root, &format!("probe-{request_id}")) {
        Ok(path) => path,
        Err(error) => {
            return DesktopCodexProbeResponse {
                request_id,
                probe: None,
                error: Some(error),
            }
        }
    };
    let cleanup_dir = runtime_dir.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = probe_codex_presence(&runtime_dir);
        let _ = fs::remove_dir_all(runtime_dir);
        result
    })
    .await;
    let _ = fs::remove_dir_all(cleanup_dir);
    match result {
        Ok(Ok(probe)) => DesktopCodexProbeResponse {
            request_id,
            probe: Some(probe),
            error: None,
        },
        Ok(Err(error)) => DesktopCodexProbeResponse {
            request_id,
            probe: None,
            error: Some(error),
        },
        Err(_) => DesktopCodexProbeResponse {
            request_id,
            probe: None,
            error: Some(AiDiagnostic::new(
                "codex_cli_probe_failed",
                "Codex CLI probe failed.",
            )),
        },
    }
}

#[tauri::command]
pub async fn connect_codex_app_server(
    app: AppHandle,
    request_id: String,
) -> DesktopCodexConnectionResponse {
    if !safe_request_id(&request_id) {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_cli_invalid",
                "The Codex connection request was invalid.",
            )),
        };
    }
    retry_retired_connections_async(&app);
    let store = app.state::<CodexAssistantStore>();
    let (existing_view, stale_connection, lease) = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        if state.installing {
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(AiDiagnostic::new(
                    "codex_app_server_start_failed",
                    "Codex CLI installation is still in progress.",
                )),
            };
        }
        let view = connection_view(&state);
        if view.is_some() {
            (view, None, None)
        } else {
            let stale_connection = state.take_unusable_connection();
            match state.reserve_connection(&request_id) {
                Ok(lease) => (None, stale_connection, Some(lease)),
                Err(error) => {
                    return DesktopCodexConnectionResponse {
                        request_id,
                        connection: None,
                        error: Some(error),
                    }
                }
            }
        }
    };
    if let Some(view) = existing_view {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: Some(view),
            error: None,
        };
    }
    let lease = lease.expect("connection lease for a new App Server");
    if let Some(connection) = stale_connection {
        let _ = close_connection_for_app(&app, connection).await;
    }
    let runtime_root = match app.path().app_local_data_dir() {
        Ok(path) => path.join("ai").join("codex-runtime"),
        Err(_) => {
            store
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .release_connection_lease(&lease);
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(AiDiagnostic::new(
                    "codex_app_server_start_failed",
                    "The controlled AI runtime directory is unavailable.",
                )),
            };
        }
    };
    let runtime_dir = match prepare_runtime_dir(&runtime_root, &request_id) {
        Ok(path) => path,
        Err(error) => {
            store
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .release_connection_lease(&lease);
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(error),
            };
        }
    };
    let cleanup_dir = runtime_dir.clone();
    let connected = tauri::async_runtime::spawn_blocking(move || {
        let executable = probe_codex_executable(&runtime_dir).map_err(|error| (error, None))?;
        let connection =
            AppServerConnection::start(&executable, &runtime_dir).map_err(|error| {
                (
                    diagnostic_from_rpc(error, "codex_app_server_start_failed"),
                    None,
                )
            })?;
        if let Err(error) = initialize_connection(&connection) {
            return Err((
                diagnostic_from_rpc(error, "codex_app_server_initialization_failed"),
                Some(connection),
            ));
        }
        let account = match read_account(&connection) {
            Ok(account) => account,
            Err(error) => {
                return Err((
                    diagnostic_from_rpc(error, "codex_account_read_failed"),
                    Some(connection),
                ));
            }
        };
        let models = if account.authenticated {
            match read_models(&connection) {
                Ok(models) => models,
                Err(error) => {
                    return Err((
                        diagnostic_from_rpc(error, "codex_model_catalog_failed"),
                        Some(connection),
                    ));
                }
            }
        } else {
            Vec::new()
        };
        let cli = CodexCliProbeView {
            found: true,
            version: Some(executable.version),
            source: Some(executable.source),
        };
        Ok::<_, (AiDiagnostic, Option<Arc<AppServerConnection>>)>((
            connection, cli, account, models,
        ))
    })
    .await;
    let (connection, cli, account, models) = match connected {
        Ok(Ok(value)) => value,
        Ok(Err((error, connection))) => {
            store
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .release_connection_lease(&lease);
            if let Some(connection) = connection {
                let outcome = close_connection_for_app(&app, connection).await;
                if !outcome.needs_retry() {
                    let _ = fs::remove_dir_all(&cleanup_dir);
                }
            } else {
                let _ = fs::remove_dir_all(&cleanup_dir);
            }
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(error),
            };
        }
        Err(_) => {
            store
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .release_connection_lease(&lease);
            let _ = fs::remove_dir_all(&cleanup_dir);
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(AiDiagnostic::new(
                    "codex_app_server_start_failed",
                    "Codex App Server connection task failed.",
                )),
            };
        }
    };
    let published = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        if state.connection_lease_is_current(&lease) && state.connection.is_none() {
            state.connection = Some(Arc::clone(&connection));
            state.cli = Some(cli);
            state.account = Some(account);
            state.models = models;
            state.release_connection_lease(&lease);
            connection_view(&state)
        } else {
            None
        }
    };
    if let Some(view) = published {
        DesktopCodexConnectionResponse {
            request_id,
            connection: Some(view),
            error: None,
        }
    } else {
        let outcome = close_connection_for_app(&app, connection).await;
        if !outcome.needs_retry() {
            let _ = fs::remove_dir_all(&cleanup_dir);
        }
        DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "The Codex connection was cancelled before it became active.",
            )),
        }
    }
}

#[tauri::command]
pub async fn refresh_codex_account(
    app: AppHandle,
    request_id: String,
) -> DesktopCodexConnectionResponse {
    if !safe_request_id(&request_id) {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_account_read_failed",
                "The account request was invalid.",
            )),
        };
    }
    let store = app.state::<CodexAssistantStore>();
    let (connection, stale_connection) = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        let stale_connection = state.take_unusable_connection();
        (state.connection.clone(), stale_connection)
    };
    if let Some(connection) = stale_connection {
        let _ = close_connection_for_app(&app, connection).await;
        return DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server disconnected before the account refresh.",
            )),
        };
    }
    let Some(connection) = connection else {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex is not connected.",
            )),
        };
    };
    let request_connection = Arc::clone(&connection);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let account = read_account(&request_connection)?;
        let models = if account.authenticated {
            read_models(&request_connection)?
        } else {
            Vec::new()
        };
        Ok::<_, RpcFailure>((account, models))
    })
    .await;
    let (account, models) = match result {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(diagnostic_from_rpc(error, "codex_account_read_failed")),
            }
        }
        Err(_) => {
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(AiDiagnostic::new(
                    "codex_account_read_failed",
                    "Codex account refresh failed.",
                )),
            }
        }
    };
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    if !state.has_connection(&connection) {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: None,
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "The Codex connection changed during the account refresh.",
            )),
        };
    }
    state.account = Some(account);
    state.models = models;
    DesktopCodexConnectionResponse {
        request_id,
        connection: connection_view(&state),
        error: None,
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn preview_ai_context(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    scopes: Vec<String>,
    language: String,
    model_id: String,
    reasoning_effort: String,
) -> DesktopAiContextPreviewResponse {
    if !safe_request_id(&request_id)
        || !safe_request_id(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
        || Uuid::parse_str(&zone_id).is_err()
        || !safe_language(&language)
    {
        return preview_failure(
            request_id,
            AiDiagnostic::new(
                "ai_context_unavailable",
                "The AI context request was invalid.",
            ),
        );
    }
    let scopes = match canonical_scopes(scopes) {
        Ok(scopes) => scopes,
        Err(error) => return preview_failure(request_id, error),
    };
    let assistant = app.state::<CodexAssistantStore>();
    let stale_connection = {
        assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned")
            .take_unusable_connection()
    };
    if let Some(connection) = stale_connection {
        let _ = close_connection_for_app(&app, connection).await;
        return preview_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server disconnected before context preview.",
            ),
        );
    }
    let connection = {
        let state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.connection.is_none()
            || state
                .account
                .as_ref()
                .is_none_or(|account| !account.authenticated)
        {
            return preview_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_not_authenticated",
                    "Codex is not authenticated with ChatGPT.",
                ),
            );
        }
        let Some(model) = state
            .models
            .iter()
            .find(|model| model.id == model_id && model.available)
        else {
            return preview_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_model_unavailable",
                    "The selected Codex model is unavailable.",
                ),
            );
        };
        if !model
            .reasoning_efforts
            .iter()
            .any(|effort| effort.id == reasoning_effort)
        {
            return preview_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_reasoning_effort_invalid",
                    "The selected reasoning effort is invalid.",
                ),
            );
        }
        Arc::clone(
            state
                .connection
                .as_ref()
                .expect("authenticated Codex connection"),
        )
    };
    let trusted = match build_trusted_context_with_attachments(
        &app,
        &project_session_id,
        &revision_id,
        &zone_id,
        &scopes,
        &language,
        &model_id,
    ) {
        Ok(context) => context,
        Err(error) => {
            return preview_failure(request_id, AiDiagnostic::new(&error.code, &error.message))
        }
    };
    let fingerprint = match context_fingerprint(&trusted, &scopes) {
        Ok(value) => value,
        Err(error) => return preview_failure(request_id, error),
    };
    let excluded_scopes = ALL_CONTEXT_SCOPES
        .iter()
        .filter(|scope| !scopes.iter().any(|selected| selected == **scope))
        .map(|scope| (*scope).to_string())
        .collect();
    let view = AiContextDisclosureView {
        preview_id: request_id.clone(),
        project_session_id: trusted.project_session_id.clone(),
        revision_id: trusted.revision_id.clone(),
        revision_number: trusted.revision_number,
        zone_id: trusted.zone_id.clone(),
        zone_name: trusted.zone_name.clone(),
        included_scopes: scopes,
        excluded_scopes,
        context_fingerprint: fingerprint,
        payload: trusted.payload.clone(),
        disclosure: AiDisclosureBoundary {
            contains_local_paths: false,
            contains_prj_text: false,
            contains_complete_result_series: false,
            model_request_uses_network: true,
        },
    };
    let mut state = assistant
        .state
        .lock()
        .expect("Codex assistant mutex poisoned");
    if !state.has_connection(&connection) {
        return preview_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "The Codex connection changed during context preview.",
            ),
        );
    }
    state.preview = Some(AiPreviewRecord {
        view: view.clone(),
        trusted,
        language,
        model_id,
        reasoning_effort,
    });
    DesktopAiContextPreviewResponse {
        request_id,
        preview: Some(view),
        error: None,
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn start_readonly_ai_turn(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    preview_id: String,
    question: String,
    scopes: Vec<String>,
    language: String,
    model_id: String,
    reasoning_effort: String,
) -> DesktopAiTurnResponse {
    if !safe_request_id(&request_id)
        || !safe_request_id(&project_session_id)
        || !safe_request_id(&preview_id)
        || Uuid::parse_str(&revision_id).is_err()
        || Uuid::parse_str(&zone_id).is_err()
        || !safe_language(&language)
        || question.trim().is_empty()
        || question.chars().count() > MAX_QUESTION_CHARS
    {
        return turn_failure(
            request_id,
            AiDiagnostic::new("ai_turn_start_failed", "The AI question was invalid."),
        );
    }
    let scopes = match canonical_scopes(scopes) {
        Ok(scopes) => scopes,
        Err(error) => return turn_failure(request_id, error),
    };
    let assistant = app.state::<CodexAssistantStore>();
    let stale_connection = {
        assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned")
            .take_unusable_connection()
    };
    if let Some(connection) = stale_connection {
        let _ = close_connection_for_app(&app, connection).await;
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server disconnected before the turn started.",
            ),
        );
    }
    let (connection, preview, existing_thread, existing_binding, context_epoch) = {
        let state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.is_some() {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "ai_turn_already_active",
                    "Another AI turn is already active.",
                ),
            );
        }
        if state
            .account
            .as_ref()
            .is_none_or(|account| !account.authenticated)
        {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_not_authenticated",
                    "Codex is not authenticated with ChatGPT.",
                ),
            );
        }
        let Some(model) = state
            .models
            .iter()
            .find(|model| model.id == model_id && model.available)
        else {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_model_unavailable",
                    "The selected Codex model is unavailable.",
                ),
            );
        };
        if !model
            .reasoning_efforts
            .iter()
            .any(|effort| effort.id == reasoning_effort)
        {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_reasoning_effort_invalid",
                    "The selected reasoning effort is invalid.",
                ),
            );
        }
        (
            state.connection.clone(),
            state.preview.clone(),
            state.thread_id.clone(),
            state.thread_binding.clone(),
            state.context_epoch,
        )
    };
    let Some(connection) = connection else {
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server is disconnected.",
            ),
        );
    };
    let Some(preview) = preview else {
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "ai_context_unavailable",
                "Generate an AI context preview before sending.",
            ),
        );
    };
    if !preview_matches_turn(
        &preview,
        &preview_id,
        &project_session_id,
        &revision_id,
        &zone_id,
        &scopes,
        &language,
        &model_id,
        &reasoning_effort,
    ) {
        return turn_failure(
            request_id,
            AiDiagnostic::new("ai_context_stale", "The AI context preview is stale."),
        );
    }
    let current = match build_trusted_context_with_attachments(
        &app,
        &project_session_id,
        &revision_id,
        &zone_id,
        &scopes,
        &language,
        &model_id,
    ) {
        Ok(context) => context,
        Err(error) => {
            return turn_failure(request_id, AiDiagnostic::new(&error.code, &error.message))
        }
    };
    let current_fingerprint = match context_fingerprint(&current, &scopes) {
        Ok(value) => value,
        Err(error) => return turn_failure(request_id, error),
    };
    if current_fingerprint != preview.view.context_fingerprint || current != preview.trusted {
        return turn_failure(
            request_id,
            AiDiagnostic::new("ai_context_stale", "The AI context changed after preview."),
        );
    }
    let archive_trusted = preview.trusted.clone();
    let archive_preview = preview.view.clone();
    let archive_language = language.clone();
    let archive_model_id = model_id.clone();
    let archive_reasoning_effort = reasoning_effort.clone();
    let archive_question = question.clone();
    let binding = AiThreadBinding {
        project_session_id,
        revision_id,
        zone_id,
        context_fingerprint: current_fingerprint,
        language: language.clone(),
        model_id: model_id.clone(),
        reasoning_effort: reasoning_effort.clone(),
    };
    let needs_thread = existing_thread.is_none() || existing_binding.as_ref() != Some(&binding);
    let runtime_dir = connection.runtime_dir.clone();
    let request_for_task = request_id.clone();
    let context_payload = preview.view.payload.clone();
    let model_for_task = model_id.clone();
    let language_for_task = language.clone();
    let reasoning_effort_for_task = reasoning_effort.clone();
    let question_for_task = question.clone();
    let cancellation = Arc::new(AtomicBool::new(false));
    let interrupt_requested = Arc::new(AtomicBool::new(false));
    let turn_epoch = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.is_some() {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "ai_turn_already_active",
                    "Another AI turn is already active.",
                ),
            );
        }
        if !state.has_connection(&connection) {
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_app_server_disconnected",
                    "The Codex connection changed before the AI turn started.",
                ),
            );
        }
        if state.context_epoch != context_epoch
            || state.preview.as_ref().is_none_or(|current_preview| {
                current_preview.view.preview_id != preview.view.preview_id
                    || current_preview.view.context_fingerprint != preview.view.context_fingerprint
            })
        {
            return turn_failure(
                request_id,
                AiDiagnostic::new("ai_context_stale", "The AI context preview is stale."),
            );
        }
        state.active_turn_request_id = Some(request_id.clone());
        state.active_turn_epoch = Some(state.context_epoch);
        state.active_turn_cancel = Some(Arc::clone(&cancellation));
        state.active_turn_interrupt_requested = Some(Arc::clone(&interrupt_requested));
        state.cancel_requested = false;
        state.context_epoch
    };
    let connection_for_task = Arc::clone(&connection);
    let task = tauri::async_runtime::spawn_blocking(move || {
        let thread_id = if needs_thread {
            let response = connection_for_task
                .request(
                    "thread/start",
                    thread_start_params(&model_for_task, &runtime_dir, &language_for_task),
                    RPC_TIMEOUT,
                )
                .map_err(TurnStartFailure::before_turn)?;
            validate_readonly_thread_response(&response, &runtime_dir)
                .map_err(TurnStartFailure::before_turn)?
        } else {
            existing_thread.expect("existing thread when no replacement is needed")
        };
        let user_payload = json!({
            "instruction": "Answer only from this disclosed CONTAM Studio context. Do not use tools or access files.",
            "context": context_payload,
            "question": question_for_task,
        });
        let user_text = serde_json::to_string(&user_payload).map_err(|_| {
            TurnStartFailure::before_turn(RpcFailure::new("ai_turn_start_failed"))
        })?;
        let response = connection_for_task
            .request(
                "turn/start",
                turn_start_params(
                    &thread_id,
                    &request_for_task,
                    &user_text,
                    &model_for_task,
                    &reasoning_effort_for_task,
                ),
                RPC_TIMEOUT,
            )
            .map_err(TurnStartFailure::after_turn_attempt)?;
        let turn_id = response
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 128)
            .ok_or_else(|| {
                TurnStartFailure::after_turn_attempt(RpcFailure::new("ai_turn_start_failed"))
            })?
            .to_string();
        Ok::<_, TurnStartFailure>((thread_id, turn_id))
    })
    .await;
    let (thread_id, turn_id) = match task {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            let cancelled = cancellation.load(Ordering::Acquire);
            if error.turn_may_have_started {
                if let Some(detached) =
                    detach_connection_after_unconfirmed_turn(&assistant, &connection, &request_id)
                {
                    let _ = close_connection_for_app(&app, detached).await;
                }
                return turn_failure(
                    request_id,
                    AiDiagnostic::new(
                        "codex_app_server_disconnected",
                        "Codex App Server could not confirm the AI turn state.",
                    ),
                );
            }
            clear_pending_turn(&assistant, &request_id);
            if cancelled {
                return turn_failure(
                    request_id,
                    AiDiagnostic::new("ai_turn_interrupted", "The AI turn was interrupted."),
                );
            }
            return turn_failure(
                request_id,
                diagnostic_from_rpc(error.error, "ai_turn_start_failed"),
            );
        }
        Err(_) => {
            if let Some(detached) =
                detach_connection_after_unconfirmed_turn(&assistant, &connection, &request_id)
            {
                let _ = close_connection_for_app(&app, detached).await;
            }
            return turn_failure(
                request_id,
                AiDiagnostic::new(
                    "codex_app_server_disconnected",
                    "Codex App Server could not confirm the AI turn state.",
                ),
            );
        }
    };
    let interrupted_before_wait = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.as_deref() != Some(request_id.as_str()) {
            true
        } else {
            state.active_turn_thread_id = Some(thread_id.clone());
            state.active_turn_id = Some(turn_id.clone());
            state.token_usage = None;
            let stale = state.context_epoch != turn_epoch || cancellation.load(Ordering::Acquire);
            if stale {
                state.cancel_requested = true;
                cancellation.store(true, Ordering::Release);
            } else {
                state.thread_id = Some(thread_id.clone());
                state.thread_binding = Some(binding);
            }
            stale
        }
    };
    let thread_for_wait = thread_id.clone();
    let turn_for_wait = turn_id.clone();
    let cancellation_for_wait = Arc::clone(&cancellation);
    let interrupt_requested_for_wait = Arc::clone(&interrupt_requested);
    let connection_for_wait = Arc::clone(&connection);
    let waited = tauri::async_runtime::spawn_blocking(move || {
        let turn_deadline = Instant::now() + TURN_TIMEOUT;
        let mut collection = TurnCollectionState::default();
        let mut stop_reason = interrupted_before_wait.then_some(TurnStopReason::UserInterrupted);
        let mut interrupt_sent = interrupt_requested_for_wait.load(Ordering::Acquire);
        let mut confirmation_deadline = None;
        if interrupt_sent {
            confirmation_deadline = Some(Instant::now() + TURN_INTERRUPT_CONFIRM_TIMEOUT);
        }
        loop {
            let now = Instant::now();
            if cancellation_for_wait.load(Ordering::Acquire) && stop_reason.is_none() {
                stop_reason = Some(TurnStopReason::UserInterrupted);
            }
            if stop_reason.is_none() && now >= turn_deadline {
                stop_reason = Some(TurnStopReason::TimedOut);
            }
            if stop_reason.is_some() {
                if !interrupt_sent {
                    if claim_turn_interrupt(&interrupt_requested_for_wait) {
                        if let Err(error) = connection_for_wait.request(
                            "turn/interrupt",
                            json!({"threadId": thread_for_wait, "turnId": turn_for_wait}),
                            TURN_INTERRUPT_REQUEST_TIMEOUT,
                        ) {
                            return TurnWaitOutcome::Failed {
                                error,
                                token_usage: collection.token_usage,
                                completion_confirmed: false,
                            };
                        }
                    }
                    interrupt_sent = true;
                    confirmation_deadline = Some(Instant::now() + TURN_INTERRUPT_CONFIRM_TIMEOUT);
                }
                if confirmation_deadline.is_some_and(|deadline| now >= deadline) {
                    return TurnWaitOutcome::Failed {
                        error: RpcFailure::new("codex_app_server_disconnected"),
                        token_usage: collection.token_usage,
                        completion_confirmed: false,
                    };
                }
            }
            let next_deadline = confirmation_deadline.unwrap_or(turn_deadline);
            let notification_timeout = next_deadline
                .checked_duration_since(Instant::now())
                .unwrap_or(Duration::from_millis(1))
                .min(Duration::from_millis(500));
            let notification = match connection_for_wait.next_notification(notification_timeout) {
                Ok(Some(value)) => value,
                Ok(None) => continue,
                Err(error) => {
                    return TurnWaitOutcome::Failed {
                        error,
                        token_usage: collection.token_usage,
                        completion_confirmed: false,
                    }
                }
            };
            match process_turn_notification(
                &notification,
                &thread_for_wait,
                &turn_for_wait,
                &mut collection,
            ) {
                TurnNotificationAction::Continue => {}
                TurnNotificationAction::InterruptForTool => {
                    if stop_reason != Some(TurnStopReason::ToolUseBlocked) {
                        eprintln!("CONTAM Studio AI safety event: tool_or_approval");
                    }
                    stop_reason = Some(TurnStopReason::ToolUseBlocked);
                }
                TurnNotificationAction::Completed(answer, usage) => {
                    if let Some(reason) = stop_reason {
                        return TurnWaitOutcome::Failed {
                            error: RpcFailure::new(reason.diagnostic_code()),
                            token_usage: usage,
                            completion_confirmed: true,
                        };
                    }
                    return TurnWaitOutcome::Completed {
                        answer,
                        token_usage: usage,
                    };
                }
                TurnNotificationAction::Failed {
                    error,
                    token_usage,
                    completion_confirmed,
                } => {
                    return TurnWaitOutcome::Failed {
                        error,
                        token_usage,
                        completion_confirmed,
                    };
                }
            }
        }
    })
    .await;
    // Never reuse a connection after a turn that might still be active. A late
    // `turn/completed` could otherwise be attributed to a later UI request.
    let turn_unconfirmed = match &waited {
        Ok(outcome) => turn_outcome_requires_connection_reset(outcome),
        Err(_) => true,
    };
    let (still_owned, context_invalidated, detached_connection) = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        let still_owned = state.active_turn_request_id.as_deref() == Some(request_id.as_str());
        let context_invalidated =
            cancellation.load(Ordering::Acquire) || state.context_epoch != turn_epoch;
        let detached_connection = if turn_unconfirmed && state.has_connection(&connection) {
            let detached = state.connection.take();
            state.clear_connection_catalog();
            detached
        } else {
            if still_owned {
                state.clear_active_turn();
                if context_invalidated {
                    state.thread_id = None;
                    state.thread_binding = None;
                    state.token_usage = None;
                }
            }
            None
        };
        if turn_unconfirmed && detached_connection.is_none() && still_owned {
            state.clear_active_turn();
        }
        (still_owned, context_invalidated, detached_connection)
    };
    if let Some(detached) = detached_connection {
        let _ = close_connection_for_app(&app, detached).await;
    }
    if turn_unconfirmed {
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server could not confirm the AI turn state.",
            ),
        );
    }
    if !still_owned {
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "The Codex connection changed during the AI turn.",
            ),
        );
    }
    if context_invalidated {
        return turn_failure(
            request_id,
            AiDiagnostic::new("ai_turn_interrupted", "The AI turn was interrupted."),
        );
    }
    match waited {
        Ok(TurnWaitOutcome::Completed {
            answer,
            token_usage,
        }) => {
            let parsed = serde_json::from_str::<StructuredAiAnswer>(&answer)
                .map_err(|_| {
                    AiDiagnostic::new(
                        "ai_response_contract_invalid",
                        "The AI response was invalid.",
                    )
                })
                .and_then(validate_answer);
            match parsed {
                Ok(answer) => {
                    assistant
                        .state
                        .lock()
                        .expect("Codex assistant mutex poisoned")
                        .token_usage = token_usage.clone();
                    let archive = persist_completed_ai_answer(
                        &app,
                        PersistCompletedAiAnswerInput {
                            trusted: archive_trusted,
                            preview: archive_preview,
                            language: archive_language,
                            model_id: archive_model_id,
                            reasoning_effort: archive_reasoning_effort,
                            question: archive_question,
                            answer: answer.clone(),
                        },
                    )
                    .await;
                    DesktopAiTurnResponse {
                        request_id,
                        status: "completed".to_string(),
                        answer: Some(answer),
                        token_usage,
                        archive,
                        error: None,
                    }
                }
                Err(error) => turn_failure(request_id, error),
            }
        }
        Ok(TurnWaitOutcome::Failed {
            error,
            token_usage,
            completion_confirmed: true,
        }) => {
            assistant
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .token_usage = token_usage.clone();
            let mut response = turn_failure(
                request_id,
                diagnostic_from_rpc(error, "ai_turn_start_failed"),
            );
            response.token_usage = token_usage;
            response
        }
        Ok(TurnWaitOutcome::Failed {
            completion_confirmed: false,
            ..
        })
        | Err(_) => turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server could not confirm the AI turn state.",
            ),
        ),
    }
}

fn active_archive_context(
    app: &AppHandle,
    project_session_id: &str,
    revision_id: &str,
    zone_id: &str,
) -> Result<AiTrustedContext, AiDiagnostic> {
    if !safe_request_id(project_session_id)
        || Uuid::parse_str(revision_id).is_err()
        || Uuid::parse_str(zone_id).is_err()
    {
        return Err(archive_error(
            "ai_archive_unavailable",
            "The local conversation archive request was invalid.",
        ));
    }
    app.state::<DesktopProjectSessionStore>()
        .build_ai_context(project_session_id, revision_id, zone_id, &[])
        .map_err(|error| AiDiagnostic::new(&error.code, &error.message))
}

#[tauri::command]
pub async fn load_ai_conversation_archive(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
) -> DesktopAiConversationArchiveResponse {
    if !safe_request_id(&request_id) {
        return archive_response_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive request was invalid.",
            ),
        );
    }
    let trusted = match active_archive_context(&app, &project_session_id, &revision_id, &zone_id) {
        Ok(context) => context,
        Err(error) => return archive_response_failure(request_id, error),
    };
    let path = match archive_file_path(&app) {
        Ok(path) => path,
        Err(error) => return archive_response_failure(request_id, error),
    };
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        let _gate = store
            .operation_gate
            .lock()
            .expect("AI conversation archive mutex poisoned");
        let archive = read_archive_file(&path)?;
        Ok::<_, AiDiagnostic>(archive_view_for_context(&archive, &trusted))
    })
    .await;
    match result {
        Ok(Ok(archive)) => DesktopAiConversationArchiveResponse {
            request_id,
            archive: Some(archive),
            error: None,
        },
        Ok(Err(error)) => archive_response_failure(request_id, error),
        Err(_) => archive_response_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive task failed.",
            ),
        ),
    }
}

#[tauri::command]
pub async fn set_ai_conversation_archive_enabled(
    app: AppHandle,
    request_id: String,
    enabled: bool,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive request was invalid.",
            ),
        );
    }
    let path = match archive_file_path(&app) {
        Ok(path) => path,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        let _gate = store
            .operation_gate
            .lock()
            .expect("AI conversation archive mutex poisoned");
        let mut archive = read_archive_file(&path)?;
        archive.persistence_enabled = enabled;
        write_archive_file(&path, &archive)
    })
    .await;
    match result {
        Ok(Ok(())) => DesktopAiActionResponse {
            request_id,
            status: if enabled { "enabled" } else { "disabled" }.to_string(),
            error: None,
        },
        Ok(Err(error)) => archive_action_failure(request_id, error),
        Err(_) => archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive task failed.",
            ),
        ),
    }
}

#[tauri::command]
pub async fn delete_ai_conversation_archive_entry(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    archive_entry_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) || Uuid::parse_str(&archive_entry_id).is_err() {
        return archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive request was invalid.",
            ),
        );
    }
    let trusted = match active_archive_context(&app, &project_session_id, &revision_id, &zone_id) {
        Ok(context) => context,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let path = match archive_file_path(&app) {
        Ok(path) => path,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        let _gate = store
            .operation_gate
            .lock()
            .expect("AI conversation archive mutex poisoned");
        let mut archive = read_archive_file(&path)?;
        let original_len = archive.entries.len();
        archive.entries.retain(|entry| {
            !(entry.entry_id == archive_entry_id
                && entry
                    .baseline_source_sha256
                    .eq_ignore_ascii_case(&trusted.baseline_source_sha256)
                && entry.zone_id == trusted.zone_id)
        });
        if archive.entries.len() == original_len {
            return Err(archive_error(
                "ai_archive_entry_not_found",
                "The local conversation archive entry is no longer available.",
            ));
        }
        write_archive_file(&path, &archive)
    })
    .await;
    match result {
        Ok(Ok(())) => DesktopAiActionResponse {
            request_id,
            status: "deleted".to_string(),
            error: None,
        },
        Ok(Err(error)) => archive_action_failure(request_id, error),
        Err(_) => archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive task failed.",
            ),
        ),
    }
}

#[tauri::command]
pub async fn clear_ai_conversation_archive_for_zone(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive request was invalid.",
            ),
        );
    }
    let trusted = match active_archive_context(&app, &project_session_id, &revision_id, &zone_id) {
        Ok(context) => context,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let path = match archive_file_path(&app) {
        Ok(path) => path,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        let _gate = store
            .operation_gate
            .lock()
            .expect("AI conversation archive mutex poisoned");
        let mut archive = read_archive_file(&path)?;
        archive.entries.retain(|entry| {
            !(entry
                .baseline_source_sha256
                .eq_ignore_ascii_case(&trusted.baseline_source_sha256)
                && entry.zone_id == trusted.zone_id)
        });
        write_archive_file(&path, &archive)
    })
    .await;
    match result {
        Ok(Ok(())) => DesktopAiActionResponse {
            request_id,
            status: "cleared_zone".to_string(),
            error: None,
        },
        Ok(Err(error)) => archive_action_failure(request_id, error),
        Err(_) => archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive task failed.",
            ),
        ),
    }
}

#[tauri::command]
pub async fn clear_all_ai_conversation_archive(
    app: AppHandle,
    request_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_unavailable",
                "The local conversation archive request was invalid.",
            ),
        );
    }
    let path = match archive_file_path(&app) {
        Ok(path) => path,
        Err(error) => return archive_action_failure(request_id, error),
    };
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let store = app_for_task.state::<AiConversationArchiveStore>();
        let _gate = store
            .operation_gate
            .lock()
            .expect("AI conversation archive mutex poisoned");
        let mut archive = read_archive_file(&path)?;
        archive.entries.clear();
        write_archive_file(&path, &archive)
    })
    .await;
    match result {
        Ok(Ok(())) => DesktopAiActionResponse {
            request_id,
            status: "cleared_all".to_string(),
            error: None,
        },
        Ok(Err(error)) => archive_action_failure(request_id, error),
        Err(_) => archive_action_failure(
            request_id,
            archive_error(
                "ai_archive_write_failed",
                "The local conversation archive task failed.",
            ),
        ),
    }
}

#[tauri::command]
pub async fn interrupt_readonly_ai_turn(
    app: AppHandle,
    request_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return DesktopAiActionResponse {
            request_id,
            status: "error".to_string(),
            error: Some(AiDiagnostic::new(
                "ai_turn_start_failed",
                "The interrupt request was invalid.",
            )),
        };
    }
    let store = app.state::<CodexAssistantStore>();
    let (connection, thread_id, turn_id, pending_start, should_send_interrupt) = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        let pending_start = state.active_turn_request_id.is_some();
        let mut should_send_interrupt = false;
        if pending_start {
            state.cancel_requested = true;
            if let Some(cancel) = &state.active_turn_cancel {
                cancel.store(true, Ordering::Release);
            }
            if let Some(interrupt_requested) = &state.active_turn_interrupt_requested {
                should_send_interrupt = claim_turn_interrupt(interrupt_requested);
            }
        }
        (
            state.connection.clone(),
            state.active_turn_thread_id.clone(),
            state.active_turn_id.clone(),
            pending_start,
            should_send_interrupt,
        )
    };
    if pending_start && turn_id.is_none() {
        return DesktopAiActionResponse {
            request_id,
            status: "interrupting".to_string(),
            error: None,
        };
    }
    let (Some(connection), Some(thread_id), Some(turn_id)) = (connection, thread_id, turn_id)
    else {
        return DesktopAiActionResponse {
            request_id,
            status: "idle".to_string(),
            error: None,
        };
    };
    if !should_send_interrupt {
        return DesktopAiActionResponse {
            request_id,
            status: "interrupting".to_string(),
            error: None,
        };
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        connection.request(
            "turn/interrupt",
            json!({"threadId": thread_id, "turnId": turn_id}),
            RPC_TIMEOUT,
        )
    })
    .await;
    match result {
        Ok(Ok(_)) => DesktopAiActionResponse {
            request_id,
            status: "interrupting".to_string(),
            error: None,
        },
        _ => DesktopAiActionResponse {
            request_id,
            status: "error".to_string(),
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex interrupt failed.",
            )),
        },
    }
}

#[tauri::command]
pub async fn clear_readonly_ai_session(
    app: AppHandle,
    request_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return DesktopAiActionResponse {
            request_id,
            status: "error".to_string(),
            error: Some(AiDiagnostic::new(
                "ai_context_unavailable",
                "The clear request was invalid.",
            )),
        };
    }
    let store = app.state::<CodexAssistantStore>();
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    if state.active_turn_request_id.is_some() {
        return DesktopAiActionResponse {
            request_id,
            status: "error".to_string(),
            error: Some(AiDiagnostic::new(
                "ai_turn_already_active",
                "Stop the active AI turn before clearing.",
            )),
        };
    }
    state.context_epoch = state.context_epoch.wrapping_add(1);
    state.preview = None;
    state.thread_id = None;
    state.thread_binding = None;
    state.token_usage = None;
    DesktopAiActionResponse {
        request_id,
        status: "cleared".to_string(),
        error: None,
    }
}

#[tauri::command]
pub async fn disconnect_codex_app_server(
    app: AppHandle,
    request_id: String,
) -> DesktopAiActionResponse {
    if !safe_request_id(&request_id) {
        return DesktopAiActionResponse {
            request_id,
            status: "error".to_string(),
            error: Some(AiDiagnostic::new(
                "codex_app_server_disconnected",
                "The disconnect request was invalid.",
            )),
        };
    }
    let store = app.state::<CodexAssistantStore>();
    let connection = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        state.invalidate_connection_attempt();
        let connection = state.connection.take();
        state.clear_connection_catalog();
        state.installing = false;
        connection
    };
    if let Some(connection) = connection {
        let _ = close_connection_for_app(&app, connection).await;
    }
    DesktopAiActionResponse {
        request_id,
        status: "stopped".to_string(),
        error: None,
    }
}

#[cfg(test)]
mod tests;
