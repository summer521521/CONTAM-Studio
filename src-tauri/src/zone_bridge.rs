use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BridgeEnvelope {
    protocol_version: String,
    request_id: String,
    ok: bool,
    result: Option<ProjectInspection>,
    error: Option<ReaderDiagnostic>,
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
            message: message.to_string(),
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
    if std::str::from_utf8(&outcome.stderr.bytes).is_err() {
        return Err((
            "python_stderr_invalid_utf8",
            "Python Zone bridge stderr was not valid UTF-8.",
            BTreeMap::new(),
        ));
    }
    let stdout = std::str::from_utf8(&outcome.stdout.bytes).map_err(|_| {
        (
            "python_stdout_invalid_utf8",
            "Python Zone bridge stdout was not valid UTF-8.",
            BTreeMap::new(),
        )
    })?;
    let envelope: BridgeEnvelope = serde_json::from_str(stdout).map_err(|_| {
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
    }
    Ok(envelope)
}

fn execute_bridge(source_path: &str, request_id: &str) -> BridgeEnvelope {
    if request_id.is_empty()
        || request_id.len() > 128
        || !request_id.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
    {
        return host_error(
            "",
            "bridge_request_invalid",
            "request_id is missing or invalid.",
            BTreeMap::new(),
        );
    }
    let path = Path::new(source_path);
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("prj"))
    {
        return host_error(
            request_id,
            "invalid_source_extension",
            "Only PRJ files can be opened by this command.",
            BTreeMap::new(),
        );
    }

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
        source_path,
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
    match validate_envelope(outcome, request_id) {
        Ok(envelope) => envelope,
        Err((code, message, context)) => host_error(request_id, code, message, context),
    }
}

#[tauri::command]
pub async fn read_prj_zones(source_path: String, request_id: String) -> BridgeEnvelope {
    let fallback_request_id = request_id.clone();
    tauri::async_runtime::spawn_blocking(move || execute_bridge(&source_path, &request_id))
        .await
        .unwrap_or_else(|_| {
            host_error(
                &fallback_request_id,
                "bridge_task_failed",
                "The Zone bridge task ended unexpectedly.",
                BTreeMap::new(),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sample_result() -> ProjectInspection {
        ProjectInspection {
            schema_version: "1.0".to_string(),
            reader_mode: "strict_contam_3_4_simple_zone_v1".to_string(),
            source_path: "sample.prj".to_string(),
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

    fn valid_envelope(request_id: &str) -> BridgeEnvelope {
        BridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.to_string(),
            request_id: request_id.to_string(),
            ok: true,
            result: Some(sample_result()),
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
        let encoded = serde_json::to_vec(&valid_envelope("request-1")).unwrap();
        let parsed = validate_envelope(outcome(encoded), "request-1").unwrap();
        assert!(parsed.ok);
        assert_eq!(parsed.result.unwrap().declared_zone_count, 0);
    }

    #[test]
    fn invalid_result_contract_is_rejected() {
        let mut envelope = valid_envelope("request-1");
        envelope.result.as_mut().unwrap().source_unchanged = false;
        let error = validate_envelope(outcome(serde_json::to_vec(&envelope).unwrap()), "request-1")
            .unwrap_err();
        assert_eq!(error.0, "python_response_result_invalid");
    }

    #[test]
    fn structured_python_error_is_preserved() {
        let envelope = BridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.to_string(),
            request_id: "request-1".to_string(),
            ok: false,
            result: None,
            error: Some(ReaderDiagnostic {
                code: "unsupported_prj_version".to_string(),
                message: "unsupported".to_string(),
                source_line_number: Some(1),
                context: BTreeMap::new(),
            }),
        };
        let parsed =
            validate_envelope(outcome(serde_json::to_vec(&envelope).unwrap()), "request-1")
                .unwrap();
        assert_eq!(parsed.error.unwrap().code, "unsupported_prj_version");
    }

    #[test]
    fn protocol_and_request_mismatches_are_rejected() {
        let mut protocol = valid_envelope("request-1");
        protocol.protocol_version = "2.0".to_string();
        let error = validate_envelope(outcome(serde_json::to_vec(&protocol).unwrap()), "request-1")
            .unwrap_err();
        assert_eq!(error.0, "python_response_protocol_mismatch");

        let request = valid_envelope("wrong-request");
        let error = validate_envelope(outcome(serde_json::to_vec(&request).unwrap()), "request-1")
            .unwrap_err();
        assert_eq!(error.0, "python_response_request_mismatch");
    }

    #[test]
    fn process_failure_and_timeout_are_structured() {
        let mut failed = outcome(Vec::new());
        failed.success = false;
        failed.exit_code = Some(9);
        assert_eq!(
            validate_envelope(failed, "request-1").unwrap_err().0,
            "python_process_failed"
        );

        let mut timed_out = outcome(Vec::new());
        timed_out.success = false;
        timed_out.timed_out = true;
        assert_eq!(
            validate_envelope(timed_out, "request-1").unwrap_err().0,
            "python_process_timeout"
        );
    }

    #[test]
    fn invalid_utf8_json_and_oversized_output_are_rejected() {
        assert_eq!(
            validate_envelope(outcome(vec![0xff]), "request-1")
                .unwrap_err()
                .0,
            "python_stdout_invalid_utf8"
        );
        assert_eq!(
            validate_envelope(outcome(b"not-json".to_vec()), "request-1")
                .unwrap_err()
                .0,
            "python_response_invalid_json"
        );

        let mut oversized = outcome(Vec::new());
        oversized.stdout.exceeded = true;
        assert_eq!(
            validate_envelope(oversized, "request-1").unwrap_err().0,
            "python_stdout_too_large"
        );
    }

    #[test]
    fn stderr_is_bounded_and_never_returned_to_frontend() {
        let captured = read_limited(&b"diagnostic detail"[..], 10);
        assert!(captured.exceeded);
        assert_eq!(captured.bytes, b"diagnostic");

        let mut oversized = outcome(Vec::new());
        oversized.stderr = captured;
        assert_eq!(
            validate_envelope(oversized, "request-1").unwrap_err().0,
            "python_stderr_too_large"
        );
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
    fn test_fixture_directory_is_not_modified_by_rust_tests() {
        let root = project_root();
        assert!(fs::metadata(root.join("fixtures/contam")).is_ok());
    }

    #[test]
    fn real_bridge_reads_official_fixture() {
        let fixture = project_root().join("fixtures/contam/official-contamxpy/test_GetPrjInfo.prj");
        let envelope = execute_bridge(fixture.to_str().unwrap(), "request-real");
        assert!(envelope.ok, "{:?}", envelope.error);
        let result = envelope.result.unwrap();
        assert_eq!(result.declared_zone_count, 7);
        assert_eq!(result.first_zone.unwrap().name, "One");
        assert!(result.source_unchanged);
    }
}
