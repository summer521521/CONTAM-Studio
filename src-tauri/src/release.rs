//! Release/configuration boundary for the desktop shell.
//!
//! This module deliberately keeps the persisted shape small.  It stores only
//! user-selected tool paths and the Studio data directory; project contents
//! and AI conversation material never cross this boundary.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub const CONFIG_SCHEMA_VERSION: u32 = 1;
const CONFIG_FILE_NAME: &str = "studio-config.json";
const MAX_PROBE_OUTPUT: usize = 16 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Contamx,
    Simread,
}

impl ToolKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Contamx => "contamx",
            Self::Simread => "simread",
        }
    }

    fn from_wire(value: &str) -> Option<Self> {
        match value {
            "contamx" | "contamx3" => Some(Self::Contamx),
            "simread" => Some(Self::Simread),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    NotConfigured,
    PathMissing,
    AccessDenied,
    NotExecutable,
    UnsupportedVersion,
    ArchitectureMismatch,
    ProbeFailed,
    Available,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolState {
    pub kind: String,
    pub status: ToolStatus,
    pub path: Option<String>,
    pub version: Option<String>,
    pub detail: Option<String>,
}

impl ToolState {
    fn unconfigured(kind: ToolKind) -> Self {
        Self {
            kind: kind.as_str().to_owned(),
            status: ToolStatus::NotConfigured,
            path: None,
            version: None,
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeInfo {
    pub app_version: String,
    pub commit_sha: String,
    pub build_kind: String,
    pub dirty: bool,
    pub architecture: String,
    pub operating_system: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StorageLayout {
    pub data_directory: String,
    pub config_directory: String,
    pub cache_directory: String,
    pub log_directory: String,
    pub temporary_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudioSetup {
    pub schema_version: u32,
    pub first_run_complete: bool,
    pub language: String,
    pub theme: String,
    pub data_directory: String,
    pub contamx: ToolState,
    pub simread: ToolState,
    pub runtime: RuntimeInfo,
    pub storage: StorageLayout,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SetupError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopSetupResponse {
    pub request_id: String,
    pub setup: Option<StudioSetup>,
    pub error: Option<SetupError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopToolProbeResponse {
    pub request_id: String,
    pub tool: Option<ToolState>,
    pub setup: Option<StudioSetup>,
    pub error: Option<SetupError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopDirectoryResponse {
    pub request_id: String,
    pub selected_directory: Option<String>,
    pub setup: Option<StudioSetup>,
    pub error: Option<SetupError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopActionResponse {
    pub request_id: String,
    pub succeeded: bool,
    pub error: Option<SetupError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopDiagnosticsResponse {
    pub request_id: String,
    pub summary: Option<Value>,
    pub error: Option<SetupError>,
}

fn error(_request_id: &str, code: &str, message: impl Into<String>) -> SetupError {
    SetupError {
        code: code.to_owned(),
        message: message.into(),
    }
}

fn response_error(
    request_id: String,
    code: &str,
    message: impl Into<String>,
) -> DesktopSetupResponse {
    DesktopSetupResponse {
        request_id,
        setup: None,
        error: Some(error("", code, message)),
    }
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn app_path(app: &AppHandle, value: Result<PathBuf, tauri::Error>, fallback: &str) -> PathBuf {
    value.unwrap_or_else(|_| {
        app.path()
            .app_local_data_dir()
            .unwrap_or_else(|_| PathBuf::from(fallback))
    })
}

fn config_directory(app: &AppHandle) -> PathBuf {
    app_path(app, app.path().app_config_dir(), "CONTAM Studio/config")
}

fn default_data_directory(app: &AppHandle) -> PathBuf {
    app_path(app, app.path().app_data_dir(), "CONTAM Studio/data")
}

fn layout(app: &AppHandle, configured_data: Option<&Path>) -> StorageLayout {
    let data = configured_data
        .map(Path::to_path_buf)
        .unwrap_or_else(|| default_data_directory(app));
    let config = config_directory(app);
    let cache = app_path(app, app.path().app_cache_dir(), "CONTAM Studio/cache");
    let logs = app_path(app, app.path().app_log_dir(), "CONTAM Studio/logs");
    let temp = app_path(app, app.path().temp_dir(), "CONTAM Studio/temp");
    StorageLayout {
        data_directory: path_string(data),
        config_directory: path_string(config),
        cache_directory: path_string(cache),
        log_directory: path_string(logs),
        temporary_directory: path_string(temp),
    }
}

fn runtime_info() -> RuntimeInfo {
    let commit_sha = option_env!("CONTAM_STUDIO_BUILD_SHA")
        .unwrap_or("unknown")
        .to_owned();
    let dirty = option_env!("CONTAM_STUDIO_BUILD_DIRTY") == Some("1");
    RuntimeInfo {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        commit_sha,
        build_kind: if cfg!(debug_assertions) {
            "development"
        } else {
            "release"
        }
        .to_owned(),
        dirty,
        architecture: std::env::consts::ARCH.to_owned(),
        operating_system: std::env::var("OS").unwrap_or_else(|_| std::env::consts::OS.to_owned()),
    }
}

fn config_file(app: &AppHandle) -> PathBuf {
    config_directory(app).join(CONFIG_FILE_NAME)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), SetupError> {
    let parent = path
        .parent()
        .ok_or_else(|| error("", "config_path_invalid", "配置目录无效。"))?;
    fs::create_dir_all(parent)
        .map_err(|_| error("", "config_directory_unavailable", "无法创建配置目录。"))?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temp = parent.join(format!(".{CONFIG_FILE_NAME}.{sequence}.tmp"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| error("", "config_temp_create_failed", "无法创建配置临时文件。"))?;
    if file.write_all(bytes).is_err() || file.sync_all().is_err() {
        let _ = fs::remove_file(&temp);
        return Err(error("", "config_write_failed", "无法写入配置。"));
    }
    if path.exists() {
        let backup = parent.join(format!(".{CONFIG_FILE_NAME}.previous"));
        let _ = fs::remove_file(&backup);
        if fs::copy(path, &backup).is_err() {
            let _ = fs::remove_file(&temp);
            return Err(error("", "config_backup_failed", "无法保护旧配置。"));
        }
        if fs::remove_file(path).is_err() {
            let _ = fs::remove_file(&temp);
            return Err(error("", "config_replace_failed", "无法替换旧配置。"));
        }
        if let Err(rename_error) = fs::rename(&temp, path) {
            let _ = fs::copy(&backup, path);
            let _ = fs::remove_file(&temp);
            return Err(error("", "config_replace_failed", rename_error.to_string()));
        }
    } else if let Err(rename_error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error("", "config_replace_failed", rename_error.to_string()));
    }
    Ok(())
}

#[cfg(test)]
type ParsedConfig = (bool, String, String, Option<PathBuf>, Option<PathBuf>);
type StoredConfig = (
    bool,
    String,
    String,
    Option<PathBuf>,
    Option<PathBuf>,
    Option<PathBuf>,
);

#[cfg(test)]
fn parse_config(value: Value) -> Result<ParsedConfig, SetupError> {
    let object = value
        .as_object()
        .ok_or_else(|| error("", "config_invalid", "配置不是对象。"))?;
    let schema = object
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    if schema > CONFIG_SCHEMA_VERSION {
        return Err(error(
            "",
            "config_version_unsupported",
            "配置版本高于当前应用。",
        ));
    }
    let first_run = object
        .get("first_run_complete")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let language = object
        .get("language")
        .and_then(Value::as_str)
        .unwrap_or("zh-CN");
    let language = if language == "en" { "en" } else { "zh-CN" }.to_owned();
    let theme = if object.get("theme").and_then(Value::as_str) == Some("dark") {
        "dark"
    } else {
        "light"
    }
    .to_owned();
    let data = object
        .get("data_directory")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let contamx = object
        .get("contamx_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let simread = object
        .get("simread_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    Ok((first_run, language, theme, data, contamx.or(simread)))
}

fn read_config(app: &AppHandle) -> Result<StoredConfig, SetupError> {
    let path = config_file(app);
    if !path.exists() {
        return Ok((
            false,
            "zh-CN".to_owned(),
            "light".to_owned(),
            None,
            None,
            None,
        ));
    }
    let mut bytes = Vec::new();
    File::open(&path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .map_err(|_| error("", "config_read_failed", "无法读取配置。"))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| error("", "config_invalid", "配置JSON无效。"))?;
    let object = value
        .as_object()
        .ok_or_else(|| error("", "config_invalid", "配置不是对象。"))?;
    let schema = object
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    if schema > CONFIG_SCHEMA_VERSION {
        return Err(error(
            "",
            "config_version_unsupported",
            "配置版本高于当前应用。",
        ));
    }
    let first_run = object
        .get("first_run_complete")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let language = if object.get("language").and_then(Value::as_str) == Some("en") {
        "en"
    } else {
        "zh-CN"
    }
    .to_owned();
    let theme = if object.get("theme").and_then(Value::as_str) == Some("dark") {
        "dark"
    } else {
        "light"
    }
    .to_owned();
    let data = object
        .get("data_directory")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let contamx = object
        .get("contamx_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let simread = object
        .get("simread_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    if schema == 0 {
        let migration_data = data.clone().unwrap_or_else(|| default_data_directory(app));
        write_config(
            app,
            first_run,
            &language,
            &theme,
            &migration_data,
            contamx.as_deref(),
            simread.as_deref(),
        )?;
    }
    Ok((first_run, language, theme, data, contamx, simread))
}

fn write_config(
    app: &AppHandle,
    first_run: bool,
    language: &str,
    theme: &str,
    data: &Path,
    contamx: Option<&Path>,
    simread: Option<&Path>,
) -> Result<(), SetupError> {
    let value = json!({
        "schema_version": CONFIG_SCHEMA_VERSION,
        "first_run_complete": first_run,
        "language": if language == "en" { "en" } else { "zh-CN" },
        "theme": if theme == "dark" { "dark" } else { "light" },
        "data_directory": data.to_string_lossy(),
        "contamx_path": contamx.map(|path| path.to_string_lossy().into_owned()),
        "simread_path": simread.map(|path| path.to_string_lossy().into_owned()),
    });
    let bytes = serde_json::to_vec_pretty(&value)
        .map_err(|_| error("", "config_encode_failed", "无法编码配置。"))?;
    atomic_write(&config_file(app), &bytes)
}

fn tool_from_path(kind: ToolKind, path: Option<&Path>) -> ToolState {
    let kind_name = kind.as_str().to_owned();
    let Some(path) = path else {
        return ToolState::unconfigured(kind);
    };
    let path_string = path_string(path.to_path_buf());
    if !path.is_absolute() {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::ProbeFailed,
            path: Some(path_string),
            version: None,
            detail: Some("工具路径必须是绝对路径。".to_owned()),
        };
    }
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(error_value) if error_value.kind() == std::io::ErrorKind::PermissionDenied => {
            return ToolState {
                kind: kind_name,
                status: ToolStatus::AccessDenied,
                path: Some(path_string),
                version: None,
                detail: Some("没有权限读取工具。".to_owned()),
            };
        }
        Err(_) => {
            return ToolState {
                kind: kind_name,
                status: ToolStatus::PathMissing,
                path: Some(path_string),
                version: None,
                detail: Some("工具路径不存在。".to_owned()),
            }
        }
    };
    if !metadata.is_file()
        || path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("exe"))
            != Some(true)
    {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::NotExecutable,
            path: Some(path_string),
            version: None,
            detail: Some("所选文件不是Windows可执行文件。".to_owned()),
        };
    }
    let mut child = match Command::new(path)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(value) => value,
        Err(_) => {
            return ToolState {
                kind: kind_name,
                status: ToolStatus::ProbeFailed,
                path: Some(path_string),
                version: None,
                detail: Some("无法启动版本探测。".to_owned()),
            }
        }
    };
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() >= PROBE_TIMEOUT => {
                let _ = child.kill();
                return ToolState {
                    kind: kind_name,
                    status: ToolStatus::ProbeFailed,
                    path: Some(path_string),
                    version: None,
                    detail: Some("版本探测超时。".to_owned()),
                };
            }
            Ok(None) => thread::sleep(Duration::from_millis(30)),
            Err(_) => {
                return ToolState {
                    kind: kind_name,
                    status: ToolStatus::ProbeFailed,
                    path: Some(path_string),
                    version: None,
                    detail: Some("读取版本探测状态失败。".to_owned()),
                }
            }
        }
    }
    let output = child.wait_with_output().ok();
    let text = output
        .as_ref()
        .map(|value| {
            let mut combined = String::from_utf8_lossy(&value.stdout).into_owned();
            combined.push_str(&String::from_utf8_lossy(&value.stderr));
            combined.chars().take(MAX_PROBE_OUTPUT).collect::<String>()
        })
        .unwrap_or_default();
    let version = version_token(&text);
    if version.is_none() {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::ProbeFailed,
            path: Some(path_string),
            version: None,
            detail: Some("版本输出不可识别。".to_owned()),
        };
    }
    if !version.as_deref().is_some_and(supported_version) {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::UnsupportedVersion,
            path: Some(path_string),
            version,
            detail: Some("工具版本不在当前支持范围内。".to_owned()),
        };
    }
    if text.to_ascii_lowercase().contains("32-bit") && std::env::consts::ARCH.contains("64") {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::ArchitectureMismatch,
            path: Some(path_string),
            version,
            detail: Some("工具报告为32位，而当前应用为64位。".to_owned()),
        };
    }
    ToolState {
        kind: kind_name,
        status: ToolStatus::Available,
        path: Some(path_string),
        version,
        detail: Some("版本探测成功；运行时仍会在独立目录中验证。".to_owned()),
    }
}

fn version_token(text: &str) -> Option<String> {
    let mut best = None;
    for token in text.split(|character: char| !character.is_ascii_digit() && character != '.') {
        if token.split('.').filter(|part| !part.is_empty()).count() >= 2
            && token.chars().any(|character| character == '.')
        {
            best = Some(token.trim_matches('.').to_owned());
            break;
        }
    }
    best
}

fn supported_version(version: &str) -> bool {
    version
        .split('.')
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .is_some_and(|major| major == 3)
}

fn setup_from_config(app: &AppHandle) -> Result<StudioSetup, SetupError> {
    let (first_run, language, theme, data, contamx, simread) = read_config(app)?;
    let data_path = data.unwrap_or_else(|| default_data_directory(app));
    Ok(StudioSetup {
        schema_version: CONFIG_SCHEMA_VERSION,
        first_run_complete: first_run,
        language,
        theme,
        data_directory: path_string(data_path.clone()),
        contamx: tool_from_path(ToolKind::Contamx, contamx.as_deref()),
        simread: tool_from_path(ToolKind::Simread, simread.as_deref()),
        runtime: runtime_info(),
        storage: layout(app, Some(&data_path)),
    })
}

fn valid_request(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 80
        && request_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_-".contains(character))
}

#[tauri::command]
pub fn get_studio_setup(app: AppHandle, request_id: String) -> DesktopSetupResponse {
    if !valid_request(&request_id) {
        return response_error(request_id, "bridge_request_invalid", "request_id无效。");
    }
    match setup_from_config(&app) {
        Ok(setup) => DesktopSetupResponse {
            request_id,
            setup: Some(setup),
            error: None,
        },
        Err(value) => DesktopSetupResponse {
            request_id,
            setup: None,
            error: Some(value),
        },
    }
}

#[tauri::command]
pub fn save_studio_setup(
    app: AppHandle,
    request_id: String,
    language: String,
    theme: String,
    data_directory: String,
    contamx_path: Option<String>,
    simread_path: Option<String>,
) -> DesktopSetupResponse {
    if !valid_request(&request_id) {
        return response_error(request_id, "bridge_request_invalid", "request_id无效。");
    }
    let data = PathBuf::from(&data_directory);
    if !data.is_absolute() || data_directory.len() > 1024 {
        return response_error(
            request_id,
            "data_directory_invalid",
            "数据目录必须是绝对路径。",
        );
    }
    if let Ok((_, _, _, Some(previous), _, _)) = read_config(&app) {
        let previous_normalized = previous.to_string_lossy().to_ascii_lowercase();
        let next_normalized = data.to_string_lossy().to_ascii_lowercase();
        let occupied = fs::read_dir(&previous)
            .ok()
            .and_then(|mut entries| entries.next())
            .is_some();
        if previous_normalized != next_normalized && occupied {
            return response_error(
                request_id,
                "data_directory_migration_required",
                "原数据目录包含内容；请先完成受控迁移，应用不会静默切换目录。",
            );
        }
    }
    if fs::create_dir_all(&data).is_err() {
        return response_error(
            request_id,
            "data_directory_unavailable",
            "无法创建或访问数据目录。",
        );
    }
    let contamx = contamx_path.as_deref().map(PathBuf::from);
    let simread = simread_path.as_deref().map(PathBuf::from);
    if let Err(value) = write_config(
        &app,
        true,
        &language,
        &theme,
        &data,
        contamx.as_deref(),
        simread.as_deref(),
    ) {
        return DesktopSetupResponse {
            request_id,
            setup: None,
            error: Some(value),
        };
    }
    match setup_from_config(&app) {
        Ok(setup) => DesktopSetupResponse {
            request_id,
            setup: Some(setup),
            error: None,
        },
        Err(value) => DesktopSetupResponse {
            request_id,
            setup: None,
            error: Some(value),
        },
    }
}

#[tauri::command]
pub fn select_data_directory(app: AppHandle, request_id: String) -> DesktopDirectoryResponse {
    if !valid_request(&request_id) {
        return DesktopDirectoryResponse {
            request_id,
            selected_directory: None,
            setup: None,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return DesktopDirectoryResponse {
            request_id,
            selected_directory: None,
            setup: None,
            error: None,
        };
    };
    let path = match selected.into_path() {
        Ok(value) => value,
        Err(_) => {
            return DesktopDirectoryResponse {
                request_id,
                selected_directory: None,
                setup: None,
                error: Some(error("", "selected_path_invalid", "所选目录不是本地路径。")),
            }
        }
    };
    if !path.is_absolute() {
        return DesktopDirectoryResponse {
            request_id,
            selected_directory: None,
            setup: None,
            error: Some(error("", "data_directory_invalid", "目录必须是绝对路径。")),
        };
    }
    let selected_directory = path_string(path);
    DesktopDirectoryResponse {
        request_id,
        selected_directory: Some(selected_directory),
        setup: None,
        error: None,
    }
}

#[tauri::command]
pub fn select_and_probe_official_tool(
    app: AppHandle,
    request_id: String,
    tool_kind: String,
) -> DesktopToolProbeResponse {
    if !valid_request(&request_id) {
        return DesktopToolProbeResponse {
            request_id,
            tool: None,
            setup: None,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let Some(kind) = ToolKind::from_wire(&tool_kind) else {
        return DesktopToolProbeResponse {
            request_id,
            tool: None,
            setup: None,
            error: Some(error("", "tool_kind_invalid", "只支持ContamX或SimRead。")),
        };
    };
    let selected = app
        .dialog()
        .file()
        .add_filter("Windows executable", &["exe"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return DesktopToolProbeResponse {
            request_id,
            tool: None,
            setup: None,
            error: None,
        };
    };
    let path = match selected.into_path() {
        Ok(value) => value,
        Err(_) => {
            return DesktopToolProbeResponse {
                request_id,
                tool: None,
                setup: None,
                error: Some(error("", "selected_path_invalid", "所选文件不是本地路径。")),
            }
        }
    };
    let tool = tool_from_path(kind, Some(&path));
    DesktopToolProbeResponse {
        request_id,
        tool: Some(tool),
        setup: None,
        error: None,
    }
}

#[tauri::command]
pub fn open_studio_directory(
    app: AppHandle,
    request_id: String,
    directory_kind: String,
) -> DesktopActionResponse {
    if !valid_request(&request_id) {
        return DesktopActionResponse {
            request_id,
            succeeded: false,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let setup = match setup_from_config(&app) {
        Ok(value) => value,
        Err(value) => {
            return DesktopActionResponse {
                request_id,
                succeeded: false,
                error: Some(value),
            }
        }
    };
    let path = match directory_kind.as_str() {
        "data" => PathBuf::from(setup.storage.data_directory),
        "logs" => PathBuf::from(setup.storage.log_directory),
        "cache" => PathBuf::from(setup.storage.cache_directory),
        _ => {
            return DesktopActionResponse {
                request_id,
                succeeded: false,
                error: Some(error("", "directory_kind_invalid", "目录类型无效。")),
            }
        }
    };
    if fs::create_dir_all(&path).is_err() {
        return DesktopActionResponse {
            request_id,
            succeeded: false,
            error: Some(error("", "directory_unavailable", "无法访问Studio目录。")),
        };
    }
    #[cfg(target_os = "windows")]
    let succeeded = Command::new("explorer.exe").arg(&path).spawn().is_ok();
    #[cfg(not(target_os = "windows"))]
    let succeeded = false;
    if succeeded {
        DesktopActionResponse {
            request_id,
            succeeded: true,
            error: None,
        }
    } else {
        DesktopActionResponse {
            request_id,
            succeeded: false,
            error: Some(error("", "directory_open_failed", "无法打开目录。")),
        }
    }
}

#[tauri::command]
pub fn clear_studio_cache(app: AppHandle, request_id: String) -> DesktopActionResponse {
    if !valid_request(&request_id) {
        return DesktopActionResponse {
            request_id,
            succeeded: false,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let cache = app_path(&app, app.path().app_cache_dir(), "CONTAM Studio/cache");
    let entries = match fs::read_dir(&cache) {
        Ok(value) => value,
        Err(_) => {
            return DesktopActionResponse {
                request_id,
                succeeded: true,
                error: None,
            }
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let result = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
        if result.is_err() {
            return DesktopActionResponse {
                request_id,
                succeeded: false,
                error: Some(error("", "cache_clear_failed", "部分缓存未能清理。")),
            };
        }
    }
    DesktopActionResponse {
        request_id,
        succeeded: true,
        error: None,
    }
}

fn sanitized_setup(setup: &StudioSetup) -> Value {
    json!({
        "schema_version": 1,
        "app_version": setup.runtime.app_version,
        "commit_sha": setup.runtime.commit_sha,
        "build_kind": setup.runtime.build_kind,
        "dirty": setup.runtime.dirty,
        "architecture": setup.runtime.architecture,
        "operating_system": setup.runtime.operating_system,
        "language": setup.language,
        "theme": setup.theme,
        "data_directory": "configured_local_data",
        "tools": {
            "contamx": { "status": setup.contamx.status, "version": setup.contamx.version },
            "simread": { "status": setup.simread.status, "version": setup.simread.version }
        },
        "recent_run_status": "not_available",
        "recent_error_code": null,
        "storage": {
            "data_directory": "configured_local_data",
            "config_directory": "app_config",
            "cache_directory": "app_cache",
            "log_directory": "app_logs",
            "temporary_directory": "app_temp"
        }
    })
}

#[tauri::command]
pub fn get_diagnostics_summary(app: AppHandle, request_id: String) -> DesktopDiagnosticsResponse {
    if !valid_request(&request_id) {
        return DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    match setup_from_config(&app) {
        Ok(setup) => DesktopDiagnosticsResponse {
            request_id,
            summary: Some(sanitized_setup(&setup)),
            error: None,
        },
        Err(value) => DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: Some(value),
        },
    }
}

#[tauri::command]
pub fn export_sanitized_diagnostics(
    app: AppHandle,
    request_id: String,
) -> DesktopDiagnosticsResponse {
    if !valid_request(&request_id) {
        return DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let setup = match setup_from_config(&app) {
        Ok(value) => value,
        Err(value) => {
            return DesktopDiagnosticsResponse {
                request_id,
                summary: None,
                error: Some(value),
            }
        }
    };
    let summary = sanitized_setup(&setup);
    let selected = app
        .dialog()
        .file()
        .set_file_name("contam-studio-diagnostics.json")
        .blocking_save_file();
    let Some(selected) = selected else {
        return DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: None,
        };
    };
    let path = match selected.into_path() {
        Ok(value) => value,
        Err(_) => {
            return DesktopDiagnosticsResponse {
                request_id,
                summary: None,
                error: Some(error("", "selected_path_invalid", "所选目标不是本地路径。")),
            }
        }
    };
    if path.exists() {
        return DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: Some(error(
                "",
                "diagnostic_target_exists",
                "目标文件已存在；为避免覆盖请另选文件名。",
            )),
        };
    }
    let bytes = match serde_json::to_vec_pretty(&summary) {
        Ok(value) => value,
        Err(_) => {
            return DesktopDiagnosticsResponse {
                request_id,
                summary: None,
                error: Some(error("", "diagnostic_encode_failed", "无法编码诊断摘要。")),
            }
        }
    };
    if atomic_write(&path, &bytes).is_err() {
        return DesktopDiagnosticsResponse {
            request_id,
            summary: None,
            error: Some(error("", "diagnostic_write_failed", "无法写入诊断摘要。")),
        };
    }
    DesktopDiagnosticsResponse {
        request_id,
        summary: Some(summary),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_token_is_bounded_and_deterministic() {
        assert_eq!(
            version_token("ContamX 3.4.0.3\n"),
            Some("3.4.0.3".to_owned())
        );
        assert_eq!(version_token("no version"), None);
        assert!(supported_version("3.4.0.3"));
        assert!(!supported_version("2.0.0"));
    }

    #[test]
    fn tool_kind_rejects_arbitrary_values() {
        assert!(ToolKind::from_wire("shell").is_none());
        assert_eq!(ToolKind::from_wire("contamx"), Some(ToolKind::Contamx));
    }

    #[test]
    fn request_validation_does_not_accept_paths_or_shell() {
        assert!(valid_request("request-1"));
        assert!(!valid_request("C:\\temp\\request"));
        assert!(!valid_request("request;whoami"));
    }

    #[test]
    fn old_config_values_have_safe_defaults() {
        let parsed = parse_config(json!({ "language": "fr", "theme": "other" })).expect("parse");
        assert_eq!(parsed.1, "zh-CN");
        assert_eq!(parsed.2, "light");
        assert!(!parsed.0);
    }

    #[test]
    fn future_config_is_rejected() {
        let result = parse_config(json!({ "schema_version": CONFIG_SCHEMA_VERSION + 1 }));
        assert_eq!(
            result.expect_err("future config").code,
            "config_version_unsupported"
        );
    }
}
