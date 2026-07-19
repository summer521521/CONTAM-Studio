use crate::zone_bridge::{sha256_file, AiTrustedContext, DesktopProjectSessionStore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
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
const PROCESS_STOP_TIMEOUT: Duration = Duration::from_secs(3);
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
const CONTEXT_FINGERPRINT_NAMESPACE: Uuid = Uuid::from_u128(0x4bf2190f_8f82_56aa_9720_19aa44ab2a6d);
const ALL_CONTEXT_SCOPES: [&str; 6] = [
    "project_summary",
    "selected_zone",
    "draft_summary",
    "run_summary",
    "result_summary",
    "diagnostics",
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
    error: Option<AiDiagnostic>,
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

#[derive(Default)]
struct AssistantState {
    connection: Option<Arc<AppServerConnection>>,
    cli: Option<CodexCliProbeView>,
    account: Option<CodexAccountView>,
    models: Vec<CodexModelView>,
    preview: Option<AiPreviewRecord>,
    thread_id: Option<String>,
    thread_binding: Option<AiThreadBinding>,
    active_turn_id: Option<String>,
    active_turn_request_id: Option<String>,
    cancel_requested: bool,
    token_usage: Option<AiTokenUsageView>,
    installing: bool,
}

impl AssistantState {
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
        self.cli = None;
        self.account = None;
        self.models.clear();
        self.preview = None;
        self.thread_id = None;
        self.thread_binding = None;
        self.active_turn_id = None;
        self.active_turn_request_id = None;
        self.cancel_requested = false;
        self.token_usage = None;
        connection
    }
}

#[derive(Default)]
pub struct CodexAssistantStore {
    state: Mutex<AssistantState>,
}

impl CodexAssistantStore {
    pub(crate) fn invalidate_context(&self) {
        let mut state = self.state.lock().expect("Codex assistant mutex poisoned");
        state.preview = None;
        state.thread_id = None;
        state.thread_binding = None;
        state.active_turn_id = None;
        state.active_turn_request_id = None;
        state.cancel_requested = false;
        state.token_usage = None;
    }
}

impl Drop for CodexAssistantStore {
    fn drop(&mut self) {
        if let Ok(state) = self.state.get_mut() {
            if let Some(connection) = state.connection.take() {
                connection.close();
            }
        }
    }
}

#[derive(Debug)]
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
            let _ = child.wait();
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
            loop {
                let Ok(count) = stream.read(&mut buffer) else {
                    break;
                };
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

    fn close(&self) {
        self.stdin
            .lock()
            .expect("Codex stdin mutex poisoned")
            .take();
        let deadline = Instant::now() + PROCESS_STOP_TIMEOUT;
        let mut child_guard = self.child.lock().expect("Codex child mutex poisoned");
        if let Some(child) = child_guard.as_mut() {
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                }
            }
        }
        child_guard.take();
        drop(child_guard);
        if let Some(handle) = self
            .stdout_thread
            .lock()
            .expect("stdout thread mutex poisoned")
            .take()
        {
            let _ = handle.join();
        }
        if let Some(handle) = self
            .stderr_thread
            .lock()
            .expect("stderr thread mutex poisoned")
            .take()
        {
            let _ = handle.join();
        }
        self.disconnected.store(true, Ordering::Release);
        let _ = fs::remove_dir_all(&self.runtime_dir);
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
        loop {
            let Ok(count) = stream.read(&mut buffer) else {
                break;
            };
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

fn join_capture_bounded(
    handle: thread::JoinHandle<(Vec<u8>, bool)>,
    timeout: Duration,
) -> Option<(Vec<u8>, bool)> {
    let deadline = Instant::now() + timeout;
    while !handle.is_finished() && Instant::now() < deadline {
        thread::sleep(POLL_INTERVAL);
    }
    if !handle.is_finished() {
        return None;
    }
    handle.join().ok()
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
    let mut command = Command::new(&path);
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
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let (stdout, stdout_truncated) = stdout.join().unwrap_or((Vec::new(), true));
    let (_, stderr_truncated) = stderr.join().unwrap_or((Vec::new(), true));
    if status.is_none_or(|status| !status.success()) || stdout_truncated || stderr_truncated {
        return Err(AiDiagnostic::new(
            "codex_cli_probe_failed",
            "Codex CLI version probe failed.",
        ));
    }
    let text = std::str::from_utf8(&stdout)
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
        version: version.to_string(),
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
    let stdout_capture = join_capture_bounded(stdout, PROCESS_STOP_TIMEOUT);
    let stderr_capture = join_capture_bounded(stderr, PROCESS_STOP_TIMEOUT);
    if stdout_capture.is_none() || stderr_capture.is_none() {
        return Err(AiDiagnostic::new(
            "codex_cli_install_failed",
            "The controlled installer stream capture did not finish.",
        ));
    }
    let (_, stdout_truncated) = stdout_capture.expect("checked installer stdout capture");
    let (_, stderr_truncated) = stderr_capture.expect("checked installer stderr capture");
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
    Failed(RpcFailure, Option<AiTokenUsageView>),
}

fn process_turn_notification(
    notification: &Value,
    expected_thread: &str,
    expected_turn: &str,
    state: &mut TurnCollectionState,
) -> TurnNotificationAction {
    if let Some(usage) = token_usage_from_notification(notification) {
        state.token_usage = Some(usage);
        return TurnNotificationAction::Continue;
    }
    if tool_event_category(notification).is_some() {
        state.tool_blocked = true;
        state.answer.clear();
        return TurnNotificationAction::InterruptForTool;
    }
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
        return TurnNotificationAction::Failed(RpcFailure::new(code), state.token_usage.clone());
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
    if method == "item/agentMessage/delta" && !state.tool_blocked {
        let Some(delta) = notification
            .pointer("/params/delta")
            .and_then(Value::as_str)
        else {
            return TurnNotificationAction::Failed(
                RpcFailure::new("ai_protocol_message_invalid"),
                state.token_usage.clone(),
            );
        };
        if state
            .answer
            .chars()
            .count()
            .saturating_add(delta.chars().count())
            > MAX_AGENT_RESPONSE_CHARS
        {
            return TurnNotificationAction::Failed(
                RpcFailure::new("ai_response_too_large"),
                state.token_usage.clone(),
            );
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
            return TurnNotificationAction::Failed(
                RpcFailure::new(code),
                state.token_usage.clone(),
            );
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
        error: Some(error),
    }
}

fn clear_pending_turn(store: &CodexAssistantStore, request_id: &str) {
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    if state.active_turn_request_id.as_deref() == Some(request_id) {
        state.active_turn_id = None;
        state.active_turn_request_id = None;
        state.cancel_requested = false;
    }
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
    let store = app.state::<CodexAssistantStore>();
    {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        if state.installing || state.active_turn_request_id.is_some() {
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
        let result = probe_codex_executable(&runtime_dir);
        let _ = fs::remove_dir_all(runtime_dir);
        result
    })
    .await;
    let _ = fs::remove_dir_all(cleanup_dir);
    match result {
        Ok(Ok(executable)) => DesktopCodexProbeResponse {
            request_id,
            probe: Some(CodexCliProbeView {
                found: true,
                version: Some(executable.version),
                source: Some(executable.source),
            }),
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
    let store = app.state::<CodexAssistantStore>();
    let (existing_view, stale_connection) = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        let view = connection_view(&state);
        let stale_connection = if view.is_none() {
            state.take_unusable_connection()
        } else {
            None
        };
        (view, stale_connection)
    };
    if let Some(view) = existing_view {
        return DesktopCodexConnectionResponse {
            request_id,
            connection: Some(view),
            error: None,
        };
    }
    if let Some(connection) = stale_connection {
        let _ = tauri::async_runtime::spawn_blocking(move || connection.close()).await;
    }
    let runtime_root = match app.path().app_local_data_dir() {
        Ok(path) => path.join("ai").join("codex-runtime"),
        Err(_) => {
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(AiDiagnostic::new(
                    "codex_app_server_start_failed",
                    "The controlled AI runtime directory is unavailable.",
                )),
            }
        }
    };
    let runtime_dir = match prepare_runtime_dir(&runtime_root, &request_id) {
        Ok(path) => path,
        Err(error) => {
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(error),
            }
        }
    };
    let cleanup_dir = runtime_dir.clone();
    let connected = tauri::async_runtime::spawn_blocking(move || {
        let executable = probe_codex_executable(&runtime_dir)?;
        let connection = AppServerConnection::start(&executable, &runtime_dir)
            .map_err(|error| diagnostic_from_rpc(error, "codex_app_server_start_failed"))?;
        if let Err(error) = initialize_connection(&connection) {
            connection.close();
            return Err(diagnostic_from_rpc(
                error,
                "codex_app_server_initialization_failed",
            ));
        }
        let account = match read_account(&connection) {
            Ok(account) => account,
            Err(error) => {
                connection.close();
                return Err(diagnostic_from_rpc(error, "codex_account_read_failed"));
            }
        };
        let models = if account.authenticated {
            match read_models(&connection) {
                Ok(models) => models,
                Err(error) => {
                    connection.close();
                    return Err(diagnostic_from_rpc(error, "codex_model_catalog_failed"));
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
        Ok::<_, AiDiagnostic>((connection, cli, account, models))
    })
    .await;
    let (connection, cli, account, models) = match connected {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            let _ = fs::remove_dir_all(&cleanup_dir);
            return DesktopCodexConnectionResponse {
                request_id,
                connection: None,
                error: Some(error),
            };
        }
        Err(_) => {
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
    let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
    state.connection = Some(connection);
    state.cli = Some(cli);
    state.account = Some(account);
    state.models = models;
    let view = connection_view(&state);
    DesktopCodexConnectionResponse {
        request_id,
        connection: view,
        error: None,
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
        let _ = tauri::async_runtime::spawn_blocking(move || connection.close()).await;
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        let account = read_account(&connection)?;
        let models = if account.authenticated {
            read_models(&connection)?
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
        let _ = tauri::async_runtime::spawn_blocking(move || connection.close()).await;
        return preview_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server disconnected before context preview.",
            ),
        );
    }
    {
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
    }
    let project_store = app.state::<DesktopProjectSessionStore>();
    let trusted = match project_store.build_ai_context(
        &project_session_id,
        &revision_id,
        &zone_id,
        &scopes,
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
    assistant
        .state
        .lock()
        .expect("Codex assistant mutex poisoned")
        .preview = Some(AiPreviewRecord {
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
        let _ = tauri::async_runtime::spawn_blocking(move || connection.close()).await;
        return turn_failure(
            request_id,
            AiDiagnostic::new(
                "codex_app_server_disconnected",
                "Codex App Server disconnected before the turn started.",
            ),
        );
    }
    let (connection, preview, existing_thread, existing_binding) = {
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
    let project_store = app.state::<DesktopProjectSessionStore>();
    let current = match project_store.build_ai_context(
        &project_session_id,
        &revision_id,
        &zone_id,
        &scopes,
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
    {
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
        state.active_turn_request_id = Some(request_id.clone());
        state.cancel_requested = false;
    }
    let task = tauri::async_runtime::spawn_blocking(move || {
        let thread_id = if needs_thread {
            let response = connection.request(
                "thread/start",
                thread_start_params(&model_id, &runtime_dir, &language),
                RPC_TIMEOUT,
            )?;
            validate_readonly_thread_response(&response, &runtime_dir)?
        } else {
            existing_thread.expect("existing thread when no replacement is needed")
        };
        let user_payload = json!({
            "instruction": "Answer only from this disclosed CONTAM Studio context. Do not use tools or access files.",
            "context": context_payload,
            "question": question,
        });
        let user_text = serde_json::to_string(&user_payload)
            .map_err(|_| RpcFailure::new("ai_turn_start_failed"))?;
        let response = connection.request(
            "turn/start",
            turn_start_params(
                &thread_id,
                &request_for_task,
                &user_text,
                &model_id,
                &reasoning_effort,
            ),
            RPC_TIMEOUT,
        )?;
        let turn_id = response
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 128)
            .ok_or_else(|| RpcFailure::new("ai_turn_start_failed"))?
            .to_string();
        Ok::<_, RpcFailure>((connection, thread_id, turn_id))
    })
    .await;
    let (connection, thread_id, turn_id) = match task {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            clear_pending_turn(&assistant, &request_id);
            return turn_failure(
                request_id,
                diagnostic_from_rpc(error, "ai_turn_start_failed"),
            );
        }
        Err(_) => {
            clear_pending_turn(&assistant, &request_id);
            return turn_failure(
                request_id,
                AiDiagnostic::new("ai_turn_start_failed", "AI turn task failed."),
            );
        }
    };
    let cancel_requested = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        state.thread_id = Some(thread_id.clone());
        state.thread_binding = Some(binding);
        state.active_turn_id = Some(turn_id.clone());
        state.active_turn_request_id = Some(request_id.clone());
        state.token_usage = None;
        state.cancel_requested
    };
    if cancel_requested {
        let _ = connection.request(
            "turn/interrupt",
            json!({"threadId": thread_id, "turnId": turn_id}),
            RPC_TIMEOUT,
        );
    }
    let thread_for_wait = thread_id.clone();
    let turn_for_wait = turn_id.clone();
    let waited = tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + TURN_TIMEOUT;
        let mut collection = TurnCollectionState::default();
        let mut interrupt_sent = false;
        loop {
            if Instant::now() >= deadline {
                let _ = connection.request(
                    "turn/interrupt",
                    json!({"threadId": thread_for_wait, "turnId": turn_for_wait}),
                    RPC_TIMEOUT,
                );
                return Err((
                    RpcFailure::new("ai_turn_start_failed"),
                    collection.token_usage,
                ));
            }
            let notification = match connection.next_notification(Duration::from_millis(500)) {
                Ok(Some(value)) => value,
                Ok(None) => continue,
                Err(error) => return Err((error, collection.token_usage)),
            };
            match process_turn_notification(
                &notification,
                &thread_for_wait,
                &turn_for_wait,
                &mut collection,
            ) {
                TurnNotificationAction::Continue => {}
                TurnNotificationAction::InterruptForTool if !interrupt_sent => {
                    eprintln!("CONTAM Studio AI safety event: tool_or_approval");
                    let _ = connection.request(
                        "turn/interrupt",
                        json!({"threadId": thread_for_wait, "turnId": turn_for_wait}),
                        RPC_TIMEOUT,
                    );
                    interrupt_sent = true;
                }
                TurnNotificationAction::InterruptForTool => {}
                TurnNotificationAction::Completed(answer, usage) => {
                    return Ok((answer, usage));
                }
                TurnNotificationAction::Failed(error, usage) => {
                    return Err((error, usage));
                }
            }
        }
    })
    .await;
    let mut state = assistant
        .state
        .lock()
        .expect("Codex assistant mutex poisoned");
    state.active_turn_id = None;
    state.active_turn_request_id = None;
    state.cancel_requested = false;
    match waited {
        Ok(Ok((answer, token_usage))) => {
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
                    state.token_usage = token_usage.clone();
                    DesktopAiTurnResponse {
                        request_id,
                        status: "completed".to_string(),
                        answer: Some(answer),
                        token_usage,
                        error: None,
                    }
                }
                Err(error) => turn_failure(request_id, error),
            }
        }
        Ok(Err((error, usage))) => {
            state.token_usage = usage.clone();
            let mut response = turn_failure(
                request_id,
                diagnostic_from_rpc(error, "ai_turn_start_failed"),
            );
            response.token_usage = usage;
            response
        }
        Err(_) => turn_failure(
            request_id,
            AiDiagnostic::new("ai_turn_start_failed", "AI turn task failed."),
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
    let (connection, thread_id, turn_id, pending_start) = {
        let mut state = store.state.lock().expect("Codex assistant mutex poisoned");
        let pending_start = state.active_turn_request_id.is_some();
        if pending_start {
            state.cancel_requested = true;
        }
        (
            state.connection.clone(),
            state.thread_id.clone(),
            state.active_turn_id.clone(),
            pending_start,
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
        let connection = state.connection.take();
        *state = AssistantState::default();
        connection
    };
    if let Some(connection) = connection {
        let _ = tauri::async_runtime::spawn_blocking(move || connection.close()).await;
    }
    DesktopAiActionResponse {
        request_id,
        status: "stopped".to_string(),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        static TEST_ROOT_SEQUENCE: AtomicU64 = AtomicU64::new(1);
        let sequence = TEST_ROOT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("codex-app-server-tests")
            .join(format!("{label}-{}-{sequence}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    struct FakeAppServer {
        notifications: Vec<Value>,
    }

    impl FakeAppServer {
        fn collect(self, thread_id: &str, turn_id: &str) -> (Result<String, &'static str>, usize) {
            let mut state = TurnCollectionState::default();
            let mut interrupts = 0;
            for notification in self.notifications {
                match process_turn_notification(&notification, thread_id, turn_id, &mut state) {
                    TurnNotificationAction::Continue => {}
                    TurnNotificationAction::InterruptForTool => interrupts += 1,
                    TurnNotificationAction::Completed(answer, _) => {
                        return (Ok(answer), interrupts)
                    }
                    TurnNotificationAction::Failed(error, _) => {
                        return (Err(error.code), interrupts)
                    }
                }
            }
            (Err("incomplete"), interrupts)
        }
    }

    #[test]
    fn context_scope_order_is_canonical_and_duplicates_are_rejected() {
        assert_eq!(
            canonical_scopes(vec!["draft_summary".into(), "selected_zone".into()]).unwrap(),
            vec!["selected_zone", "draft_summary"]
        );
        assert_eq!(
            canonical_scopes(vec!["selected_zone".into(), "selected_zone".into()])
                .unwrap_err()
                .code,
            "ai_context_scope_invalid"
        );
    }

    #[test]
    fn answer_contract_rejects_extra_fields_and_oversized_items() {
        let extra = r#"{"deterministic_facts":[],"interpretation":"ok","limitations":[],"suggested_questions":[],"path":"x"}"#;
        assert!(serde_json::from_str::<StructuredAiAnswer>(extra).is_err());
        let invalid = StructuredAiAnswer {
            deterministic_facts: vec!["x".repeat(MAX_RESPONSE_ITEM_CHARS + 1)],
            interpretation: "ok".into(),
            limitations: vec![],
            suggested_questions: vec![],
        };
        assert_eq!(
            validate_answer(invalid).unwrap_err().code,
            "ai_response_contract_invalid"
        );
    }

    #[test]
    fn tool_events_are_blocked_without_retaining_payloads() {
        for item_type in TOOL_ITEM_TYPES {
            let value = json!({
                "method": "item/started",
                "params": {"item": {"type": item_type, "command": "secret"}}
            });
            assert_eq!(tool_event_category(&value), Some("tool_item"));
        }
        assert_eq!(
            tool_event_category(
                &json!({"method": "item/commandExecution/requestApproval", "id": 7})
            ),
            Some("approval_or_permission_request")
        );
    }

    #[test]
    fn connection_and_disclosure_views_never_contain_paths_or_credentials() {
        let probe = DesktopCodexProbeResponse {
            request_id: "request-1".into(),
            probe: Some(CodexCliProbeView {
                found: true,
                version: Some("1.2.3".into()),
                source: Some("path".into()),
            }),
            error: None,
        };
        let text = serde_json::to_string(&probe).unwrap();
        assert!(!text.contains("C:\\"));
        assert!(!text.contains("auth.json"));
        assert!(!text.contains("token"));
    }

    #[test]
    fn readonly_instructions_forbid_tools_and_undisclosed_data() {
        let text = thread_system_instructions("en");
        assert!(text.contains("Do not read files"));
        assert!(text.contains("run commands"));
        assert!(text.contains("undisclosed data"));
        let zh = thread_system_instructions("zh-CN");
        assert!(zh.contains("Simplified Chinese"));
    }

    #[test]
    fn response_schema_is_closed_and_bounded() {
        let schema = answer_schema();
        assert_eq!(
            schema.get("additionalProperties"),
            Some(&Value::Bool(false))
        );
        assert_eq!(
            schema.pointer("/properties/deterministic_facts/maxItems"),
            Some(&json!(8))
        );
        assert_eq!(
            schema.pointer("/properties/suggested_questions/maxItems"),
            Some(&json!(6))
        );
    }

    #[test]
    fn protocol_constants_are_bounded() {
        assert!(MAX_RPC_LINE_BYTES <= 256 * 1024);
        assert!(MAX_RPC_TOTAL_BYTES <= 8 * 1024 * 1024);
        assert!(RPC_TIMEOUT <= Duration::from_secs(10));
        assert!(TURN_TIMEOUT <= Duration::from_secs(90));
    }

    #[test]
    fn safe_request_and_language_validation_reject_injection() {
        assert!(safe_request_id("c74f8588-60e6-4b1f-bcd1-8ec31c52c213"));
        assert!(!safe_request_id("id --danger"));
        assert!(safe_language("zh-CN"));
        assert!(safe_language("en"));
        assert!(!safe_language("../../en"));
    }

    #[test]
    fn account_response_exposes_only_safe_subscription_state() {
        let view = parse_account_response(&json!({
            "account": {
                "type": "chatgpt",
                "planType": "plus",
                "email": "private@example.test",
                "id": "private-user"
            }
        }))
        .unwrap();
        assert!(view.authenticated);
        assert_eq!(view.auth_mode.as_deref(), Some("chatgpt"));
        assert_eq!(view.plan_type.as_deref(), Some("plus"));
        let serialized = serde_json::to_string(&view).unwrap();
        assert!(!serialized.contains("private@example"));
        assert!(!serialized.contains("private-user"));

        let logged_out = parse_account_response(&json!({"account": null})).unwrap();
        assert!(!logged_out.authenticated);
        assert!(logged_out.requires_login);
        assert_eq!(
            parse_account_response(&json!({"account": {"type": "chatgpt/path"}}))
                .unwrap_err()
                .code,
            "codex_account_read_failed"
        );
    }

    #[test]
    fn model_catalog_preserves_server_order_and_skips_hidden_models() {
        let mut models = Vec::new();
        let cursor = append_model_page(
            &json!({
                "data": [
                    {
                        "model": "visible-model",
                        "displayName": "Visible Model",
                        "hidden": false,
                        "isDefault": true,
                        "defaultReasoningEffort": "low",
                        "supportedReasoningEfforts": [
                            {"reasoningEffort": "low", "description": "Low"},
                            {"reasoningEffort": "high", "description": "High"}
                        ]
                    },
                    {
                        "model": "hidden-model",
                        "displayName": "Hidden Model",
                        "hidden": true,
                        "defaultReasoningEffort": "medium",
                        "supportedReasoningEfforts": [
                            {"reasoningEffort": "medium", "description": "Medium"}
                        ]
                    }
                ],
                "nextCursor": "page-2"
            }),
            &mut models,
        )
        .unwrap();
        assert_eq!(cursor.as_deref(), Some("page-2"));
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "visible-model");
        assert_eq!(
            models[0]
                .reasoning_efforts
                .iter()
                .map(|effort| effort.id.as_str())
                .collect::<Vec<_>>(),
            vec!["low", "high"]
        );
    }

    #[test]
    fn model_catalog_rejects_unknown_default_effort_and_unsafe_ids() {
        for raw in [
            json!({
                "data": [{
                    "model": "unsafe/model",
                    "displayName": "Unsafe",
                    "defaultReasoningEffort": "low",
                    "supportedReasoningEfforts": [{"reasoningEffort": "low"}]
                }]
            }),
            json!({
                "data": [{
                    "model": "safe-model",
                    "displayName": "Safe",
                    "defaultReasoningEffort": "ultra",
                    "supportedReasoningEfforts": [{"reasoningEffort": "low"}]
                }]
            }),
        ] {
            assert_eq!(
                append_model_page(&raw, &mut Vec::new()).unwrap_err().code,
                "codex_model_catalog_failed"
            );
        }
    }

    #[test]
    fn protocol_parser_rejects_invalid_utf8_non_objects_and_limits() {
        let mut total = 0;
        assert_eq!(
            parse_protocol_message(&mut vec![0xff, b'\n'], &mut total)
                .unwrap_err()
                .code,
            "ai_protocol_message_invalid"
        );
        total = 0;
        assert_eq!(
            parse_protocol_message(&mut b"[]\n".to_vec(), &mut total)
                .unwrap_err()
                .code,
            "ai_protocol_message_invalid"
        );
        total = MAX_RPC_TOTAL_BYTES;
        assert_eq!(
            parse_protocol_message(&mut b"{}\n".to_vec(), &mut total)
                .unwrap_err()
                .code,
            "ai_protocol_message_too_large"
        );
        total = 0;
        assert_eq!(
            parse_protocol_message(&mut b"{\"method\":\"ok\"}\r\n".to_vec(), &mut total).unwrap()
                ["method"],
            "ok"
        );
    }

    #[test]
    fn notification_poll_timeout_is_not_treated_as_disconnect() {
        let (_sender, receiver) = mpsc::channel();
        let connection = AppServerConnection {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            notifications: Mutex::new(receiver),
            next_id: AtomicU64::new(1),
            disconnected: AtomicBool::new(false),
            stdout_thread: Mutex::new(None),
            stderr_thread: Mutex::new(None),
            stderr_capture: Arc::new(Mutex::new(Vec::new())),
            stderr_truncated: Arc::new(AtomicBool::new(false)),
            runtime_dir: test_root("notification-timeout"),
        };
        assert_eq!(
            connection
                .next_notification(Duration::from_millis(1))
                .unwrap(),
            None
        );
        connection.close();
    }

    #[test]
    fn stale_connection_is_cleared_before_a_catalog_can_be_reused() {
        let root = test_root("stale-connection");
        let (_sender, receiver) = mpsc::channel();
        let connection = Arc::new(AppServerConnection {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            notifications: Mutex::new(receiver),
            next_id: AtomicU64::new(1),
            disconnected: AtomicBool::new(false),
            stdout_thread: Mutex::new(None),
            stderr_thread: Mutex::new(None),
            stderr_capture: Arc::new(Mutex::new(Vec::new())),
            stderr_truncated: Arc::new(AtomicBool::new(false)),
            runtime_dir: root,
        });
        let mut state = AssistantState {
            connection: Some(Arc::clone(&connection)),
            cli: Some(CodexCliProbeView {
                found: true,
                version: Some("0.144.6".into()),
                source: Some("official_install".into()),
            }),
            account: Some(CodexAccountView {
                authenticated: true,
                auth_mode: Some("chatgpt".into()),
                plan_type: Some("plus".into()),
                requires_login: false,
            }),
            models: vec![CodexModelView {
                id: "model-a".into(),
                display_name: "Model A".into(),
                is_default: true,
                available: true,
                reasoning_efforts: Vec::new(),
                default_reasoning_effort: "".into(),
            }],
            ..AssistantState::default()
        };
        assert!(connection_view(&state).is_none());
        let stale = state.take_unusable_connection().expect("stale connection");
        assert!(Arc::ptr_eq(&stale, &connection));
        assert!(state.connection.is_none());
        assert!(state.cli.is_none());
        assert!(state.account.is_none());
        assert!(state.models.is_empty());
        stale.close();
    }

    #[test]
    fn fake_app_server_collects_agent_deltas_and_ignores_old_turns() {
        let server = FakeAppServer {
            notifications: vec![
                json!({"method":"item/agentMessage/delta","params":{"threadId":"old","turnId":"old","delta":"secret"}}),
                json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"{\"deterministic_facts\":[],"}}),
                json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"\"interpretation\":\"ok\",\"limitations\":[],\"suggested_questions\":[]}"}}),
                json!({"method":"turn/completed","params":{"threadId":"thread-1","turnId":"turn-1","turn":{"status":"completed"}}}),
            ],
        };
        let (answer, interrupts) = server.collect("thread-1", "turn-1");
        assert_eq!(interrupts, 0);
        assert!(answer.unwrap().contains("\"interpretation\":\"ok\""));
    }

    #[test]
    fn fake_app_server_blocks_tool_and_approval_events_and_discards_answer() {
        for event in [
            json!({"method":"item/started","params":{"threadId":"thread-1","turnId":"turn-1","item":{"type":"commandExecution","command":"private"}}}),
            json!({"id":42,"method":"item/fileChange/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1"}}),
        ] {
            let server = FakeAppServer {
                notifications: vec![
                    json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"must discard"}}),
                    event,
                    json!({"method":"turn/completed","params":{"threadId":"thread-1","turnId":"turn-1","turn":{"status":"interrupted"}}}),
                ],
            };
            let (answer, interrupts) = server.collect("thread-1", "turn-1");
            assert_eq!(answer.unwrap_err(), "ai_tool_use_blocked");
            assert_eq!(interrupts, 1);
        }
    }

    #[test]
    fn cli_discovery_is_explicit_and_does_not_accept_argument_strings() {
        let root = test_root("discovery");
        let executable = root.join("codex.exe");
        fs::write(&executable, b"fake").unwrap();
        let (configured, source) =
            discover_codex_from(Some(executable.clone().into_os_string()), None, None).unwrap();
        assert_eq!(configured, fs::canonicalize(&executable).unwrap());
        assert_eq!(source, "environment");
        assert_eq!(
            discover_codex_from(Some(OsString::from("codex.exe --danger")), None, None)
                .unwrap_err()
                .code,
            "codex_cli_invalid"
        );
        let path = env::join_paths([root.as_path()]).unwrap();
        let (_, source) = discover_codex_from(None, Some(path), None).unwrap();
        assert_eq!(source, "path");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn official_user_install_is_preferred_over_path_without_scanning() {
        let root = test_root("official-install-discovery");
        let local = root.join("local");
        let path_dir = root.join("path");
        let official = official_codex_install_path(&local);
        fs::create_dir_all(official.parent().unwrap()).unwrap();
        fs::create_dir_all(&path_dir).unwrap();
        fs::write(&official, b"official").unwrap();
        fs::write(path_dir.join("codex.exe"), b"path").unwrap();
        let path = env::join_paths([path_dir.as_path()]).unwrap();
        let (selected, source) =
            discover_codex_from(None, Some(path), Some(local.clone().into_os_string())).unwrap();
        assert_eq!(selected, fs::canonicalize(official).unwrap());
        assert_eq!(source, "official_install");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_environment_path_still_precedes_official_user_install() {
        let root = test_root("configured-before-official");
        let configured = root.join("configured").join("codex.exe");
        let local = root.join("local");
        let official = official_codex_install_path(&local);
        fs::create_dir_all(configured.parent().unwrap()).unwrap();
        fs::create_dir_all(official.parent().unwrap()).unwrap();
        fs::write(&configured, b"configured").unwrap();
        fs::write(&official, b"official").unwrap();
        let (selected, source) = discover_codex_from(
            Some(configured.clone().into_os_string()),
            None,
            Some(local.into_os_string()),
        )
        .unwrap();
        assert_eq!(selected, fs::canonicalize(configured).unwrap());
        assert_eq!(source, "environment");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn official_installer_wrapper_is_fixed_pinned_and_noninteractive() {
        let script = installer_wrapper_script();
        assert!(script.contains(OFFICIAL_CODEX_INSTALLER_URL));
        assert!(script.contains(OFFICIAL_CODEX_INSTALLER_SHA256));
        assert!(script.contains("CODEX_NON_INTERACTIVE"));
        assert!(script.contains("Get-FileHash"));
        assert!(!script.contains("request_id"));
        assert!(!script.contains("Invoke-Expression"));
        assert!(INSTALL_TIMEOUT <= Duration::from_secs(180));
        assert!(MAX_INSTALLER_SCRIPT_BYTES <= 128 * 1024);
    }

    #[test]
    fn installer_failures_map_to_stable_codes_without_output() {
        assert_eq!(
            installer_exit_diagnostic(Some(22), false).code,
            "codex_cli_installer_unsupported"
        );
        assert_eq!(
            installer_exit_diagnostic(None, true).code,
            "codex_cli_install_timeout"
        );
        assert_eq!(
            installer_exit_diagnostic(Some(1), false).code,
            "codex_cli_install_failed"
        );
    }

    #[test]
    fn installer_response_contains_no_command_url_or_path() {
        let response = DesktopCodexInstallResponse {
            request_id: "request-1".into(),
            status: "installed".into(),
            probe: Some(CodexCliProbeView {
                found: true,
                version: Some("0.144.6".into()),
                source: Some("official_install".into()),
            }),
            error: None,
        };
        let serialized = serde_json::to_string(&response).unwrap();
        for forbidden in ["C:\\", "https://", "powershell", "install.ps1"] {
            assert!(!serialized.contains(forbidden));
        }
    }

    #[test]
    fn executable_identity_recheck_detects_replacement() {
        let root = test_root("identity");
        let path = root.join("codex.exe");
        fs::write(&path, b"first").unwrap();
        let metadata = fs::metadata(&path).unwrap();
        let (sha256, size_bytes) = sha256_file(&path).unwrap();
        let executable = CodexExecutable {
            path: path.clone(),
            version: "test".into(),
            source: "environment".into(),
            sha256,
            size_bytes,
            modified: metadata.modified().ok(),
        };
        verify_codex_identity(&executable).unwrap();
        fs::write(&path, b"second").unwrap();
        assert_eq!(
            verify_codex_identity(&executable).unwrap_err().code,
            "codex_cli_invalid"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn controlled_environment_excludes_project_and_python_variables() {
        let mut command = Command::new("codex.exe");
        apply_codex_environment(&mut command);
        let names = command
            .get_envs()
            .filter_map(|(name, value)| value.map(|_| name.to_string_lossy().to_string()))
            .collect::<Vec<_>>();
        assert!(!names.iter().any(|name| name.starts_with("CONTAM_STUDIO_")));
        assert!(!names
            .iter()
            .any(|name| matches!(name.as_str(), "PYTHONPATH" | "PYTHONHOME" | "VIRTUAL_ENV")));
    }

    #[test]
    fn thread_and_turn_requests_enforce_readonly_tool_free_contract() {
        let runtime = Path::new("C:\\controlled-ai-runtime");
        let thread = thread_start_params("model-a", runtime, "en");
        assert_eq!(thread["cwd"], runtime.to_string_lossy().as_ref());
        assert_eq!(thread["approvalPolicy"], "never");
        assert_eq!(thread["sandbox"], "read-only");
        assert_eq!(thread["ephemeral"], true);
        assert_eq!(thread["config"]["mcp_servers"], json!({}));
        assert_eq!(thread["dynamicTools"], json!([]));
        assert_eq!(thread["selectedCapabilityRoots"], json!([]));
        assert_eq!(thread["environments"], json!([]));
        assert_eq!(thread["experimentalRawEvents"], false);

        let turn = turn_start_params("thread-1", "request-1", "safe context", "model-a", "low");
        assert_eq!(turn["approvalPolicy"], "never");
        assert_eq!(turn["sandboxPolicy"]["type"], "readOnly");
        assert_eq!(turn["sandboxPolicy"]["networkAccess"], false);
        assert_eq!(turn["environments"], json!([]));
        assert_eq!(turn["summary"], "none");
        assert_eq!(turn["outputSchema"]["additionalProperties"], false);
    }

    #[test]
    fn readonly_thread_response_accepts_inherited_instruction_sources_without_workspace_access() {
        let root = test_root("readonly-thread-response");
        let runtime = root.join("runtime");
        fs::create_dir_all(&runtime).unwrap();
        let response = json!({
            "thread": {"id": "thread-1"},
            "cwd": runtime.to_string_lossy(),
            "sandbox": {"type": "readOnly", "networkAccess": false},
            "approvalPolicy": "never",
            "instructionSources": ["C:\\Users\\test-user\\.codex\\AGENTS.md"],
            "runtimeWorkspaceRoots": []
        });
        assert_eq!(
            validate_readonly_thread_response(&response, &runtime).unwrap(),
            "thread-1"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn readonly_thread_response_accepts_only_the_controlled_runtime_workspace_root() {
        let root = test_root("readonly-thread-response-reject");
        let runtime = root.join("runtime");
        let other_runtime = root.join("other-runtime");
        fs::create_dir_all(&runtime).unwrap();
        fs::create_dir_all(&other_runtime).unwrap();
        let base = json!({
            "thread": {"id": "thread-1"},
            "cwd": runtime.to_string_lossy(),
            "sandbox": {"type": "readOnly", "networkAccess": false},
            "approvalPolicy": "never",
            "instructionSources": [],
            "runtimeWorkspaceRoots": []
        });
        assert!(validate_readonly_thread_response(&base, &runtime).is_ok());

        let mut with_controlled_runtime_root = base.clone();
        with_controlled_runtime_root["runtimeWorkspaceRoots"] = json!([runtime.to_string_lossy()]);
        assert!(validate_readonly_thread_response(&with_controlled_runtime_root, &runtime).is_ok());

        let mut with_workspace_root = base.clone();
        with_workspace_root["runtimeWorkspaceRoots"] = json!([other_runtime.to_string_lossy()]);
        assert_eq!(
            validate_readonly_thread_response(&with_workspace_root, &runtime)
                .unwrap_err()
                .code,
            "codex_readonly_mode_unavailable"
        );

        let mut mismatched_runtime = base.clone();
        mismatched_runtime["cwd"] = json!(other_runtime.to_string_lossy());
        assert_eq!(
            validate_readonly_thread_response(&mismatched_runtime, &runtime)
                .unwrap_err()
                .code,
            "codex_readonly_mode_unavailable"
        );

        let mut invalid_instruction_source = base;
        invalid_instruction_source["instructionSources"] = json!([42]);
        assert_eq!(
            validate_readonly_thread_response(&invalid_instruction_source, &runtime)
                .unwrap_err()
                .code,
            "codex_readonly_mode_unavailable"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn context_invalidation_discards_thread_and_turn_but_keeps_connection_catalog() {
        let store = CodexAssistantStore::default();
        {
            let mut state = store.state.lock().unwrap();
            state.cli = Some(CodexCliProbeView {
                found: true,
                version: Some("1.0.0".into()),
                source: Some("path".into()),
            });
            state.account = Some(CodexAccountView {
                authenticated: true,
                auth_mode: Some("chatgpt".into()),
                plan_type: Some("plus".into()),
                requires_login: false,
            });
            state.models.push(CodexModelView {
                id: "model-a".into(),
                display_name: "Model A".into(),
                is_default: true,
                available: true,
                reasoning_efforts: vec![CodexReasoningEffortView {
                    id: "low".into(),
                    description: "Low".into(),
                }],
                default_reasoning_effort: "low".into(),
            });
            state.thread_id = Some("thread-private".into());
            state.active_turn_id = Some("turn-private".into());
            state.active_turn_request_id = Some("request-private".into());
            state.cancel_requested = true;
        }
        store.invalidate_context();
        let state = store.state.lock().unwrap();
        assert!(state.thread_id.is_none());
        assert!(state.active_turn_id.is_none());
        assert!(state.active_turn_request_id.is_none());
        assert!(!state.cancel_requested);
        assert_eq!(state.models.len(), 1);
        assert!(state
            .account
            .as_ref()
            .is_some_and(|account| account.authenticated));
    }

    #[test]
    fn thread_binding_changes_for_every_trusted_dimension() {
        let binding = AiThreadBinding {
            project_session_id: "session-a".into(),
            revision_id: "revision-a".into(),
            zone_id: "zone-a".into(),
            context_fingerprint: "fingerprint-a".into(),
            language: "en".into(),
            model_id: "model-a".into(),
            reasoning_effort: "low".into(),
        };
        for changed in [
            AiThreadBinding {
                project_session_id: "session-b".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                revision_id: "revision-b".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                zone_id: "zone-b".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                context_fingerprint: "fingerprint-b".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                language: "zh-CN".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                model_id: "model-b".into(),
                ..binding.clone()
            },
            AiThreadBinding {
                reasoning_effort: "high".into(),
                ..binding.clone()
            },
        ] {
            assert_ne!(binding, changed);
        }
    }

    #[test]
    fn preview_is_bound_to_language_model_and_reasoning_effort() {
        let trusted = AiTrustedContext {
            project_session_id: "session-a".into(),
            revision_id: "revision-a".into(),
            revision_number: 1,
            zone_id: "zone-a".into(),
            zone_name: "One".into(),
            payload: json!({"selected_zone": {"name": "One"}}),
        };
        let preview = AiPreviewRecord {
            view: AiContextDisclosureView {
                preview_id: "preview-a".into(),
                project_session_id: trusted.project_session_id.clone(),
                revision_id: trusted.revision_id.clone(),
                revision_number: trusted.revision_number,
                zone_id: trusted.zone_id.clone(),
                zone_name: trusted.zone_name.clone(),
                included_scopes: vec!["selected_zone".into()],
                excluded_scopes: Vec::new(),
                context_fingerprint: "fingerprint-a".into(),
                payload: trusted.payload.clone(),
                disclosure: AiDisclosureBoundary {
                    contains_local_paths: false,
                    contains_prj_text: false,
                    contains_complete_result_series: false,
                    model_request_uses_network: true,
                },
            },
            trusted,
            language: "en".into(),
            model_id: "model-a".into(),
            reasoning_effort: "low".into(),
        };
        let matches = |language: &str, model: &str, effort: &str| {
            preview_matches_turn(
                &preview,
                "preview-a",
                "session-a",
                "revision-a",
                "zone-a",
                &["selected_zone".into()],
                language,
                model,
                effort,
            )
        };
        assert!(matches("en", "model-a", "low"));
        assert!(!matches("zh-CN", "model-a", "low"));
        assert!(!matches("en", "model-b", "low"));
        assert!(!matches("en", "model-a", "high"));
    }

    #[test]
    fn token_usage_notification_is_whitelisted() {
        let usage = token_usage_from_notification(&json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": "private-thread",
                "tokenUsage": {"total": {
                    "inputTokens": 10,
                    "cachedInputTokens": 4,
                    "outputTokens": 5,
                    "totalTokens": 15,
                    "secretMetadata": "not exposed"
                }}
            }
        }))
        .unwrap();
        assert_eq!(usage.input_tokens, Some(10));
        assert_eq!(usage.cached_input_tokens, Some(4));
        assert_eq!(usage.output_tokens, Some(5));
        assert_eq!(usage.total_tokens, Some(15));
        assert!(!serde_json::to_string(&usage)
            .unwrap()
            .contains("secretMetadata"));
    }
}
