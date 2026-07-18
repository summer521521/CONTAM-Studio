use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const PROTOCOL_VERSION: &str = "1.0";
const RESULT_SCHEMA_VERSION: &str = "1.0";
const READER_MODE: &str = "strict_contam_3_4_simple_zone_v1";
const BRIDGE_OPERATION: &str = "read_simple_zones";
const BRIDGE_MODULE: &str = "contam_studio_core.zone_bridge";
const PYTHON_ENVIRONMENT_VARIABLE: &str = "CONTAM_STUDIO_PYTHON";
const PROCESS_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 16 * 1024;
const MAX_DIAGNOSTIC_CODE_BYTES: usize = 80;
const MAX_DIAGNOSTIC_MESSAGE_CHARS: usize = 160;
const MAX_CONTEXT_STRING_CHARS: usize = 120;
const PYTHON_DIAGNOSTIC_MESSAGE: &str = "Python Zone bridge returned a structured diagnostic.";

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
struct RawReaderDiagnostic {
    code: String,
    message: String,
    source_line_number: Option<u64>,
    context: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ReaderDiagnostic {
    code: String,
    message: String,
    source_line_number: Option<u64>,
    context: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ZoneRecord {
    contam_number: i64,
    name: String,
    flags: i64,
    level_number: i64,
    relative_height: f64,
    volume_m3: f64,
    source_line_number: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
struct RawProjectInspection {
    schema_version: String,
    reader_mode: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
    header_version: String,
    header_variant: i64,
    declared_zone_count: u64,
    zones: Vec<ZoneRecord>,
    first_zone: Option<ZoneRecord>,
    diagnostics: Vec<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ProjectInspection {
    schema_version: String,
    reader_mode: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
    header_version: String,
    header_variant: i64,
    declared_zone_count: u64,
    zones: Vec<ZoneRecord>,
    first_zone: Option<ZoneRecord>,
    diagnostics: Vec<ReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
struct RawBridgeEnvelope {
    protocol_version: String,
    request_id: String,
    ok: bool,
    result: Option<RawProjectInspection>,
    error: Option<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BridgeEnvelope {
    protocol_version: String,
    request_id: String,
    ok: bool,
    result: Option<ProjectInspection>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopOpenResponse {
    request_id: String,
    cancelled: bool,
    envelope: Option<BridgeEnvelope>,
}

#[derive(Debug, Serialize)]
struct BridgeRequest<'a> {
    protocol_version: &'static str,
    request_id: &'a str,
    operation: &'static str,
    source_path: &'a str,
}

#[derive(Debug)]
struct Capture {
    bytes: Vec<u8>,
    exceeded: bool,
}

#[derive(Debug)]
struct ProcessOutcome {
    success: bool,
    exit_code: Option<i32>,
    timed_out: bool,
    stdout: Capture,
    stderr: Capture,
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a repository parent")
        .to_path_buf()
}

fn discover_python(configured: Option<OsString>, root: &Path) -> Result<PathBuf, &'static str> {
    if let Some(value) = configured {
        let candidate = PathBuf::from(value);
        return (candidate.is_absolute() && candidate.is_file())
            .then_some(candidate)
            .ok_or("python_runtime_not_found");
    }

    let candidate = root
        .join("python")
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    candidate
        .is_file()
        .then_some(candidate)
        .ok_or("python_runtime_not_found")
}

fn request_id_is_valid(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 128
        && request_id.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
}

fn diagnostic_code_is_valid(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= MAX_DIAGNOSTIC_CODE_BYTES
        && code
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn context_key_is_allowed(key: &str) -> bool {
    matches!(
        key,
        "byte_offset"
            | "candidate_count"
            | "contam_number"
            | "declared_count"
            | "expected"
            | "exit_code"
            | "field"
            | "field_count"
            | "header_variant"
            | "header_version"
            | "max_bytes"
            | "name_length"
            | "parsed_count"
            | "token"
    )
}

fn truncate_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn sanitize_raw_diagnostic(raw: RawReaderDiagnostic) -> Result<ReaderDiagnostic, ()> {
    let RawReaderDiagnostic {
        code,
        message: _,
        source_line_number,
        context,
    } = raw;
    if !diagnostic_code_is_valid(&code) {
        return Err(());
    }
    let context = context
        .into_iter()
        .filter_map(|(key, value)| {
            if !context_key_is_allowed(&key) {
                return None;
            }
            match value {
                Value::String(value) => Some((
                    key,
                    Value::String(truncate_chars(&value, MAX_CONTEXT_STRING_CHARS)),
                )),
                Value::Number(_) => Some((key, value)),
                _ => None,
            }
        })
        .collect();
    Ok(ReaderDiagnostic {
        code,
        message: PYTHON_DIAGNOSTIC_MESSAGE.to_string(),
        source_line_number,
        context,
    })
}

fn canonicalize_selected_path(path: &Path) -> Result<PathBuf, &'static str> {
    if !path.is_file() {
        return Err("selected_path_invalid");
    }
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("prj"))
    {
        return Err("invalid_source_extension");
    }
    let canonical = std::fs::canonicalize(path).map_err(|_| "selected_path_invalid")?;
    if !canonical.is_file() || canonical.to_str().is_none() {
        return Err("selected_path_invalid");
    }
    Ok(canonical)
}

impl DesktopOpenResponse {
    fn cancelled(request_id: &str) -> Self {
        Self {
            request_id: request_id.to_string(),
            cancelled: true,
            envelope: None,
        }
    }

    fn completed(request_id: &str, envelope: BridgeEnvelope) -> Self {
        Self {
            request_id: request_id.to_string(),
            cancelled: false,
            envelope: Some(envelope),
        }
    }
}

fn host_error(
    request_id: &str,
    code: &str,
    message: &str,
    context: BTreeMap<String, Value>,
) -> BridgeEnvelope {
    BridgeEnvelope {
        protocol_version: PROTOCOL_VERSION.to_string(),
        request_id: request_id.to_string(),
        ok: false,
        result: None,
        error: Some(ReaderDiagnostic {
            code: code.to_string(),
            message: truncate_chars(message, MAX_DIAGNOSTIC_MESSAGE_CHARS),
            source_line_number: None,
            context,
        }),
    }
}

fn read_limited<R: Read>(mut reader: R, limit: usize) -> Capture {
    let mut bytes = Vec::with_capacity(limit.min(8192));
    let mut exceeded = false;
    let mut buffer = [0_u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = limit.saturating_sub(bytes.len());
                let accepted = remaining.min(count);
                bytes.extend_from_slice(&buffer[..accepted]);
                exceeded |= accepted < count;
            }
            Err(_) => break,
        }
    }
    Capture { bytes, exceeded }
}

fn wait_with_timeout(
    child: &mut Child,
    timeout: Duration,
) -> std::io::Result<(bool, bool, Option<i32>)> {
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok((status.success(), false, status.code()));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let status = child.wait()?;
            return Ok((false, true, status.code()));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn run_process(
    executable: &Path,
    arguments: &[OsString],
    stdin_bytes: &[u8],
    working_directory: &Path,
    timeout: Duration,
    stdout_limit: usize,
    stderr_limit: usize,
) -> Result<ProcessOutcome, std::io::Error> {
    let mut child = Command::new(executable)
        .args(arguments)
        .current_dir(working_directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let stdout_reader = thread::spawn(move || read_limited(stdout, stdout_limit));
    let stderr_reader = thread::spawn(move || read_limited(stderr, stderr_limit));

    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(stdin_bytes).is_err() {
            let _ = child.kill();
        }
    }

    let (success, timed_out, exit_code) = wait_with_timeout(&mut child, timeout)?;
    let stdout = stdout_reader.join().unwrap_or(Capture {
        bytes: Vec::new(),
        exceeded: false,
    });
    let stderr = stderr_reader.join().unwrap_or(Capture {
        bytes: Vec::new(),
        exceeded: false,
    });
    Ok(ProcessOutcome {
        success,
        exit_code,
        timed_out,
        stdout,
        stderr,
    })
}

fn validate_envelope(
    outcome: ProcessOutcome,
    request_id: &str,
    selected_path: &Path,
) -> Result<BridgeEnvelope, (&'static str, &'static str, BTreeMap<String, Value>)> {
    if outcome.timed_out {
        return Err((
            "python_process_timeout",
            "Python Zone bridge exceeded its execution timeout.",
            BTreeMap::new(),
        ));
    }
    if outcome.stdout.exceeded {
        return Err((
            "python_stdout_too_large",
            "Python Zone bridge stdout exceeded its size limit.",
            BTreeMap::from([("max_bytes".to_string(), json!(MAX_STDOUT_BYTES))]),
        ));
    }
    if outcome.stderr.exceeded {
        return Err((
            "python_stderr_too_large",
            "Python Zone bridge stderr exceeded its size limit.",
            BTreeMap::from([("max_bytes".to_string(), json!(MAX_STDERR_BYTES))]),
        ));
    }
    if !outcome.stderr.bytes.is_empty() {
        if std::str::from_utf8(&outcome.stderr.bytes).is_err() {
            return Err((
                "python_stderr_invalid_utf8",
                "Python Zone bridge stderr was not valid UTF-8.",
                BTreeMap::new(),
            ));
        }
        return Err((
            "python_stderr_not_empty",
            "Python Zone bridge wrote unexpected diagnostics to stderr.",
            BTreeMap::new(),
        ));
    }
    if !outcome.success {
        let exit_code = outcome
            .exit_code
            .map_or_else(|| "terminated".to_string(), |value| value.to_string());
        return Err((
            "python_process_failed",
            "Python Zone bridge exited without a valid response.",
            BTreeMap::from([("exit_code".to_string(), json!(exit_code))]),
        ));
    }
    let stdout = std::str::from_utf8(&outcome.stdout.bytes).map_err(|_| {
        (
            "python_stdout_invalid_utf8",
            "Python Zone bridge stdout was not valid UTF-8.",
            BTreeMap::new(),
        )
    })?;
    let envelope: RawBridgeEnvelope = serde_json::from_str(stdout).map_err(|_| {
        (
            "python_response_invalid_json",
            "Python Zone bridge returned invalid JSON.",
            BTreeMap::new(),
        )
    })?;
    if envelope.protocol_version != PROTOCOL_VERSION {
        return Err((
            "python_response_protocol_mismatch",
            "Python Zone bridge returned an unsupported protocol version.",
            BTreeMap::new(),
        ));
    }
    if envelope.request_id != request_id {
        return Err((
            "python_response_request_mismatch",
            "Python Zone bridge response did not match the request.",
            BTreeMap::new(),
        ));
    }
    if (envelope.ok && (envelope.result.is_none() || envelope.error.is_some()))
        || (!envelope.ok && (envelope.result.is_some() || envelope.error.is_none()))
    {
        return Err((
            "python_response_contract_invalid",
            "Python Zone bridge response violated the envelope contract.",
            BTreeMap::new(),
        ));
    }
    if let Some(result) = envelope.result.as_ref() {
        let first_zone_matches = result.first_zone.as_ref() == result.zones.first();
        let result_is_valid = result.schema_version == RESULT_SCHEMA_VERSION
            && result.reader_mode == READER_MODE
            && result.source_unchanged
            && result.declared_zone_count as usize == result.zones.len()
            && first_zone_matches
            && result.source_sha256.len() == 64
            && result
                .source_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit());
        if !result_is_valid {
            return Err((
                "python_response_result_invalid",
                "Python Zone bridge returned an invalid result contract.",
                BTreeMap::new(),
            ));
        }
        let returned_path =
            std::fs::canonicalize(Path::new(&result.source_path)).map_err(|_| {
                (
                    "python_response_source_mismatch",
                    "Python Zone bridge response did not match the selected source.",
                    BTreeMap::new(),
                )
            })?;
        if returned_path != selected_path {
            return Err((
                "python_response_source_mismatch",
                "Python Zone bridge response did not match the selected source.",
                BTreeMap::new(),
            ));
        }
    }

    let result = envelope
        .result
        .map(|result| {
            let diagnostics = result
                .diagnostics
                .into_iter()
                .map(sanitize_raw_diagnostic)
                .collect::<Result<Vec<_>, _>>()?;
            Ok::<ProjectInspection, ()>(ProjectInspection {
                schema_version: result.schema_version,
                reader_mode: result.reader_mode,
                source_path: selected_path
                    .to_str()
                    .expect("selected path was validated as UTF-8")
                    .to_string(),
                source_sha256: result.source_sha256,
                source_size_bytes: result.source_size_bytes,
                source_unchanged: result.source_unchanged,
                header_version: result.header_version,
                header_variant: result.header_variant,
                declared_zone_count: result.declared_zone_count,
                zones: result.zones,
                first_zone: result.first_zone,
                diagnostics,
            })
        })
        .transpose()
        .map_err(|_| {
            (
                "python_response_diagnostic_invalid",
                "Python Zone bridge returned an invalid diagnostic.",
                BTreeMap::new(),
            )
        })?;
    let error = envelope
        .error
        .map(sanitize_raw_diagnostic)
        .transpose()
        .map_err(|_| {
            (
                "python_response_diagnostic_invalid",
                "Python Zone bridge returned an invalid diagnostic.",
                BTreeMap::new(),
            )
        })?;
    Ok(BridgeEnvelope {
        protocol_version: envelope.protocol_version,
        request_id: envelope.request_id,
        ok: envelope.ok,
        result,
        error,
    })
}

fn execute_bridge(source_path: &Path, request_id: &str) -> BridgeEnvelope {
    if !request_id_is_valid(request_id) {
        return host_error(
            "",
            "bridge_request_invalid",
            "request_id is missing or invalid.",
            BTreeMap::new(),
        );
    }
    let Some(source_path_text) = source_path.to_str() else {
        return host_error(
            request_id,
            "selected_path_invalid",
            "The selected source path is not supported.",
            BTreeMap::new(),
        );
    };

    let root = project_root();
    let python = match discover_python(std::env::var_os(PYTHON_ENVIRONMENT_VARIABLE), &root) {
        Ok(path) => path,
        Err(code) => {
            return host_error(
                request_id,
                code,
                "The configured CONTAM Studio Python runtime was not found.",
                BTreeMap::new(),
            )
        }
    };
    let request = BridgeRequest {
        protocol_version: PROTOCOL_VERSION,
        request_id,
        operation: BRIDGE_OPERATION,
        source_path: source_path_text,
    };
    let stdin_bytes = match serde_json::to_vec(&request) {
        Ok(bytes) => bytes,
        Err(_) => {
            return host_error(
                request_id,
                "bridge_request_serialization_failed",
                "The Zone bridge request could not be serialized.",
                BTreeMap::new(),
            )
        }
    };
    let arguments = [
        OsString::from("-I"),
        OsString::from("-m"),
        OsString::from(BRIDGE_MODULE),
    ];
    let outcome = match run_process(
        &python,
        &arguments,
        &stdin_bytes,
        &root,
        PROCESS_TIMEOUT,
        MAX_STDOUT_BYTES,
        MAX_STDERR_BYTES,
    ) {
        Ok(outcome) => outcome,
        Err(_) => {
            return host_error(
                request_id,
                "python_process_start_failed",
                "The Python Zone bridge process could not be started.",
                BTreeMap::new(),
            )
        }
    };
    match validate_envelope(outcome, request_id, source_path) {
        Ok(envelope) => envelope,
        Err((code, message, context)) => host_error(request_id, code, message, context),
    }
}

#[tauri::command]
pub async fn select_and_read_prj_zones(app: AppHandle, request_id: String) -> DesktopOpenResponse {
    if !request_id_is_valid(&request_id) {
        return DesktopOpenResponse::completed(
            "",
            host_error(
                "",
                "bridge_request_invalid",
                "request_id is missing or invalid.",
                BTreeMap::new(),
            ),
        );
    }

    let dialog_app = app.clone();
    let selected = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("CONTAM PRJ", &["prj"])
            .blocking_pick_file()
    })
    .await
    {
        Ok(selected) => selected,
        Err(_) => {
            return DesktopOpenResponse::completed(
                &request_id,
                host_error(
                    &request_id,
                    "desktop_dialog_failed",
                    "The native file dialog ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let Some(selected) = selected else {
        return DesktopOpenResponse::cancelled(&request_id);
    };
    let selected_path = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            return DesktopOpenResponse::completed(
                &request_id,
                host_error(
                    &request_id,
                    "selected_path_invalid",
                    "The selected item is not a supported local file path.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let canonical_path = match canonicalize_selected_path(&selected_path) {
        Ok(path) => path,
        Err(code) => {
            return DesktopOpenResponse::completed(
                &request_id,
                host_error(
                    &request_id,
                    code,
                    "The selected item is not a supported local PRJ file.",
                    BTreeMap::new(),
                ),
            )
        }
    };

    let bridge_request_id = request_id.clone();
    let envelope = tauri::async_runtime::spawn_blocking(move || {
        execute_bridge(&canonical_path, &bridge_request_id)
    })
    .await
    .unwrap_or_else(|_| {
        host_error(
            &request_id,
            "bridge_task_failed",
            "The Zone bridge task ended unexpectedly.",
            BTreeMap::new(),
        )
    });
    DesktopOpenResponse::completed(&request_id, envelope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture_path(relative: &str) -> PathBuf {
        std::fs::canonicalize(project_root().join(relative)).unwrap()
    }

    fn primary_fixture() -> PathBuf {
        fixture_path("fixtures/contam/official-contamxpy/test_GetPrjInfo.prj")
    }

    fn raw_diagnostic(code: &str) -> RawReaderDiagnostic {
        RawReaderDiagnostic {
            code: code.to_string(),
            message: "untrusted Python message".to_string(),
            source_line_number: Some(1),
            context: BTreeMap::new(),
        }
    }

    fn sample_result(source_path: &Path) -> RawProjectInspection {
        RawProjectInspection {
            schema_version: "1.0".to_string(),
            reader_mode: "strict_contam_3_4_simple_zone_v1".to_string(),
            source_path: source_path.to_str().unwrap().to_string(),
            source_sha256: "a".repeat(64),
            source_size_bytes: 100,
            source_unchanged: true,
            header_version: "3.4.0.4".to_string(),
            header_variant: 0,
            declared_zone_count: 0,
            zones: Vec::new(),
            first_zone: None,
            diagnostics: Vec::new(),
        }
    }

    fn valid_envelope(request_id: &str, source_path: &Path) -> RawBridgeEnvelope {
        RawBridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.to_string(),
            request_id: request_id.to_string(),
            ok: true,
            result: Some(sample_result(source_path)),
            error: None,
        }
    }

    fn outcome(stdout: Vec<u8>) -> ProcessOutcome {
        ProcessOutcome {
            success: true,
            exit_code: Some(0),
            timed_out: false,
            stdout: Capture {
                bytes: stdout,
                exceeded: false,
            },
            stderr: Capture {
                bytes: Vec::new(),
                exceeded: false,
            },
        }
    }

    #[test]
    fn python_discovery_prefers_valid_explicit_path() {
        let python = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("python/.venv/Scripts/python.exe");
        assert_eq!(
            discover_python(Some(python.clone().into_os_string()), Path::new("ignored")),
            Ok(python)
        );
    }

    #[test]
    fn invalid_explicit_python_does_not_fall_back() {
        assert_eq!(
            discover_python(
                Some(OsString::from("Z:/missing/python.exe")),
                &project_root()
            ),
            Err("python_runtime_not_found")
        );
    }

    #[test]
    fn request_serialization_uses_stable_contract() {
        let request = BridgeRequest {
            protocol_version: PROTOCOL_VERSION,
            request_id: "request-1",
            operation: BRIDGE_OPERATION,
            source_path: "F:/example.prj",
        };
        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["protocol_version"], "1.0");
        assert_eq!(value["request_id"], "request-1");
        assert_eq!(value["operation"], "read_simple_zones");
        assert_eq!(value["source_path"], "F:/example.prj");
    }

    #[test]
    fn valid_response_is_deserialized_and_mapped() {
        let selected = primary_fixture();
        let noncanonical = selected
            .parent()
            .unwrap()
            .join(".")
            .join(selected.file_name().unwrap());
        let encoded = serde_json::to_vec(&valid_envelope("request-1", &noncanonical)).unwrap();
        let parsed = validate_envelope(outcome(encoded), "request-1", &selected).unwrap();
        assert!(parsed.ok);
        let result = parsed.result.unwrap();
        assert_eq!(result.declared_zone_count, 0);
        assert_eq!(Path::new(&result.source_path), selected);
    }

    #[test]
    fn mismatched_response_source_is_rejected() {
        let selected = primary_fixture();
        let other = fixture_path("fixtures/contam/official-nist-tutorials/demo1c.prj");
        let encoded = serde_json::to_vec(&valid_envelope("request-1", &other)).unwrap();
        let error = validate_envelope(outcome(encoded), "request-1", &selected).unwrap_err();
        assert_eq!(error.0, "python_response_source_mismatch");
        assert!(error.2.is_empty());
    }

    #[test]
    fn invalid_result_contract_is_rejected() {
        let selected = primary_fixture();
        let mut envelope = valid_envelope("request-1", &selected);
        envelope.result.as_mut().unwrap().source_unchanged = false;
        let error = validate_envelope(
            outcome(serde_json::to_vec(&envelope).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap_err();
        assert_eq!(error.0, "python_response_result_invalid");
    }

    #[test]
    fn structured_python_error_is_sanitized_before_serialization() {
        let selected = primary_fixture();
        let mut diagnostic = raw_diagnostic("unsupported_prj_version");
        diagnostic.message = "Traceback: C:\\secret\\project.prj".repeat(20);
        diagnostic.context = BTreeMap::from([
            ("token".to_string(), json!("x".repeat(300))),
            ("header_version".to_string(), json!("3.4.0.8")),
            ("source_path".to_string(), json!("C:/secret/project.prj")),
            ("traceback".to_string(), json!("private stack")),
            ("field".to_string(), json!({"nested": "not allowed"})),
        ]);
        let envelope = RawBridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.to_string(),
            request_id: "request-1".to_string(),
            ok: false,
            result: None,
            error: Some(diagnostic),
        };
        let parsed = validate_envelope(
            outcome(serde_json::to_vec(&envelope).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap();
        let error = parsed.error.unwrap();
        assert_eq!(error.code, "unsupported_prj_version");
        assert_eq!(error.message, PYTHON_DIAGNOSTIC_MESSAGE);
        let serialized = serde_json::to_string(&error).unwrap();
        assert!(!serialized.contains("Traceback"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("private stack"));
        assert_eq!(error.context.len(), 2);
        assert_eq!(error.context["header_version"], json!("3.4.0.8"));
        assert_eq!(
            error.context["token"].as_str().unwrap().chars().count(),
            MAX_CONTEXT_STRING_CHARS
        );
    }

    #[test]
    fn malicious_python_diagnostics_are_filtered_on_error_and_success() {
        let selected = primary_fixture();
        let mut diagnostic = raw_diagnostic("invalid_zone_field");
        diagnostic.message = "Traceback: C:\\secret\\project.prj".repeat(20);
        diagnostic.context = BTreeMap::from([
            ("token".to_string(), json!("x".repeat(300))),
            ("field_count".to_string(), json!(19)),
            ("source_path".to_string(), json!("C:/secret/project.prj")),
            ("traceback".to_string(), json!("private stack")),
            ("field".to_string(), json!({"nested": "not allowed"})),
            ("expected".to_string(), json!(true)),
        ]);
        let mut envelope = valid_envelope("request-1", &selected);
        envelope.result.as_mut().unwrap().diagnostics = vec![diagnostic];
        let parsed = validate_envelope(
            outcome(serde_json::to_vec(&envelope).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap();
        let serialized = serde_json::to_string(&parsed).unwrap();
        assert!(!serialized.contains("Traceback"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("source_path\":\"C:"));
        assert!(!serialized.contains("private stack"));
        let diagnostic = &parsed.result.unwrap().diagnostics[0];
        assert_eq!(diagnostic.context.len(), 2);
        assert_eq!(diagnostic.context["field_count"], json!(19));
        assert_eq!(
            diagnostic.context["token"]
                .as_str()
                .unwrap()
                .chars()
                .count(),
            120
        );
    }

    #[test]
    fn invalid_diagnostic_code_rejects_the_entire_response() {
        let selected = primary_fixture();
        let envelope = RawBridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.to_string(),
            request_id: "request-1".to_string(),
            ok: false,
            result: None,
            error: Some(raw_diagnostic("Invalid-Code")),
        };
        let error = validate_envelope(
            outcome(serde_json::to_vec(&envelope).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap_err();
        assert_eq!(error.0, "python_response_diagnostic_invalid");
    }

    #[test]
    fn protocol_and_request_mismatches_are_rejected() {
        let selected = primary_fixture();
        let mut protocol = valid_envelope("request-1", &selected);
        protocol.protocol_version = "2.0".to_string();
        let error = validate_envelope(
            outcome(serde_json::to_vec(&protocol).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap_err();
        assert_eq!(error.0, "python_response_protocol_mismatch");

        let request = valid_envelope("wrong-request", &selected);
        let error = validate_envelope(
            outcome(serde_json::to_vec(&request).unwrap()),
            "request-1",
            &selected,
        )
        .unwrap_err();
        assert_eq!(error.0, "python_response_request_mismatch");
    }

    #[test]
    fn process_failure_and_timeout_are_structured() {
        let selected = primary_fixture();
        let mut failed = outcome(Vec::new());
        failed.success = false;
        failed.exit_code = Some(9);
        assert_eq!(
            validate_envelope(failed, "request-1", &selected)
                .unwrap_err()
                .0,
            "python_process_failed"
        );

        let mut timed_out = outcome(Vec::new());
        timed_out.success = false;
        timed_out.timed_out = true;
        assert_eq!(
            validate_envelope(timed_out, "request-1", &selected)
                .unwrap_err()
                .0,
            "python_process_timeout"
        );
    }

    #[test]
    fn invalid_utf8_json_and_oversized_output_are_rejected() {
        let selected = primary_fixture();
        assert_eq!(
            validate_envelope(outcome(vec![0xff]), "request-1", &selected)
                .unwrap_err()
                .0,
            "python_stdout_invalid_utf8"
        );
        assert_eq!(
            validate_envelope(outcome(b"not-json".to_vec()), "request-1", &selected)
                .unwrap_err()
                .0,
            "python_response_invalid_json"
        );

        let mut oversized = outcome(Vec::new());
        oversized.stdout.exceeded = true;
        assert_eq!(
            validate_envelope(oversized, "request-1", &selected)
                .unwrap_err()
                .0,
            "python_stdout_too_large"
        );
    }

    #[test]
    fn stderr_is_bounded_and_never_returned_to_frontend() {
        let selected = primary_fixture();
        let captured = read_limited(&b"diagnostic detail"[..], 10);
        assert!(captured.exceeded);
        assert_eq!(captured.bytes, b"diagnostic");

        let mut oversized = outcome(Vec::new());
        oversized.stderr = captured;
        assert_eq!(
            validate_envelope(oversized, "request-1", &selected)
                .unwrap_err()
                .0,
            "python_stderr_too_large"
        );

        let encoded = serde_json::to_vec(&valid_envelope("request-1", &selected)).unwrap();
        let mut nonempty = outcome(encoded);
        nonempty.stderr.bytes = b"unexpected diagnostic".to_vec();
        let error = validate_envelope(nonempty, "request-1", &selected).unwrap_err();
        assert_eq!(error.0, "python_stderr_not_empty");
        assert!(error.2.is_empty());
    }

    #[test]
    fn process_start_failure_is_returned() {
        let missing = project_root().join("definitely-missing-python.exe");
        let error = run_process(
            &missing,
            &[],
            b"{}",
            &project_root(),
            Duration::from_millis(50),
            1024,
            1024,
        )
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    }

    #[test]
    fn real_timeout_kills_process() {
        let python = discover_python(None, &project_root()).unwrap();
        let script = "import time; time.sleep(2)";
        let outcome = run_process(
            &python,
            &[OsString::from("-c"), OsString::from(script)],
            b"",
            &project_root(),
            Duration::from_millis(80),
            1024,
            1024,
        )
        .unwrap();
        assert!(outcome.timed_out);
        assert!(!outcome.success);
    }

    #[test]
    fn output_limit_discards_excess_without_growing_buffer() {
        let capture = read_limited(&vec![b'x'; 4096][..], 128);
        assert!(capture.exceeded);
        assert_eq!(capture.bytes.len(), 128);
    }

    #[test]
    fn cancelled_desktop_response_has_no_error_envelope() {
        let response = DesktopOpenResponse::cancelled("request-1");
        assert_eq!(response.request_id, "request-1");
        assert!(response.cancelled);
        assert!(response.envelope.is_none());
    }

    #[test]
    fn custom_command_acl_and_frontend_boundary_are_explicit() {
        let build_script = include_str!("../build.rs");
        let permission =
            include_str!("../permissions/autogenerated/select_and_read_prj_zones.toml");
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let desktop_api = include_str!("../../src/app/desktop-api.ts");
        let package_json = include_str!("../../package.json");

        assert!(build_script.contains("AppManifest::new"));
        assert!(build_script.contains("select_and_read_prj_zones"));
        assert!(permission.contains("commands.allow = [\"select_and_read_prj_zones\"]"));
        assert_eq!(
            capability["permissions"],
            json!(["core:default", "allow-select-and-read-prj-zones"])
        );
        assert!(!desktop_api.contains("sourcePath"));
        assert!(!desktop_api.contains("@tauri-apps/plugin-dialog"));
        assert!(!package_json.contains("@tauri-apps/plugin-dialog"));
    }

    #[test]
    fn test_fixture_directory_is_not_modified_by_rust_tests() {
        let root = project_root();
        assert!(fs::metadata(root.join("fixtures/contam")).is_ok());
    }

    #[test]
    fn real_bridge_reads_all_official_fixtures() {
        let fixtures = [
            (
                "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj",
                7,
                "One",
            ),
            (
                "fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj",
                3,
                "one",
            ),
            (
                "fixtures/contam/official-nist-tutorials/demo1c.prj",
                7,
                "Attic",
            ),
        ];
        for (relative, count, first_name) in fixtures {
            let fixture = fixture_path(relative);
            let envelope = execute_bridge(&fixture, "request-real");
            assert!(envelope.ok, "{:?}", envelope.error);
            let result = envelope.result.unwrap();
            assert_eq!(result.declared_zone_count, count);
            assert_eq!(result.first_zone.unwrap().name, first_name);
            assert!(result.source_unchanged);
            assert_eq!(Path::new(&result.source_path), fixture);
        }
    }
}
