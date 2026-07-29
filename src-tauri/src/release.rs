//! Release/configuration boundary for the desktop shell.
//!
//! This module deliberately keeps the persisted shape small.  It stores only
//! user-selected tool paths and the Studio data directory; project contents
//! and AI conversation material never cross this boundary.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::ffi::c_void;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};

use crate::controlled_process::ControlledChild;

pub const CONFIG_SCHEMA_VERSION: u32 = 1;
const CONFIG_FILE_NAME: &str = "studio-config.json";
const MAX_PROBE_OUTPUT: usize = 16 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const CONTAM_TOOLS_LOCK_JSON: &str = include_str!("../../resources/contam-tools.lock.json");
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
    ResourceMissing,
    HashMismatch,
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
pub struct StorageCategoryView {
    pub id: String,
    pub kind: String,
    pub file_count: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StorageUsageView {
    pub root_label: String,
    pub categories: Vec<StorageCategoryView>,
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

#[derive(Debug, Clone, Serialize)]
pub struct DesktopStorageUsageResponse {
    pub request_id: String,
    pub usage: Option<StorageUsageView>,
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

#[derive(Debug, Clone, Deserialize)]
struct ContamToolsLockEntry {
    file: String,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ContamToolsLock {
    files: Vec<ContamToolsLockEntry>,
}

fn parse_contam_tools_lock() -> Result<ContamToolsLock, SetupError> {
    serde_json::from_str(CONTAM_TOOLS_LOCK_JSON)
        .map_err(|_| error("", "tool_lock_invalid", "内置工具清单无效。"))
}

fn is_path_within(root: &Path, candidate: &Path) -> bool {
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    let Ok(candidate) = fs::canonicalize(candidate) else {
        return false;
    };
    candidate.starts_with(root)
}

fn sha256_file(path: &Path) -> Result<String, SetupError> {
    let mut file =
        File::open(path).map_err(|_| error("", "tool_hash_failed", "无法验证内置工具。"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| error("", "tool_hash_failed", "无法验证内置工具。"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:X}", hasher.finalize()))
}

fn find_file_under(root: &Path, file_name: &str) -> Option<PathBuf> {
    if !root.is_dir() {
        return None;
    }
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory).ok()?.flatten() {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case(file_name))
            {
                return Some(path);
            }
        }
    }
    None
}

fn bundled_tool_from_root(root: &Path, kind: ToolKind) -> Option<ToolState> {
    if !root.is_dir() {
        return None;
    }
    let expected_name = match kind {
        ToolKind::Contamx => "contamx3.exe",
        ToolKind::Simread => "simread.exe",
    };
    let lock = match parse_contam_tools_lock() {
        Ok(value) => value,
        Err(value) => {
            return Some(ToolState {
                kind: kind.as_str().to_owned(),
                status: ToolStatus::ProbeFailed,
                path: None,
                version: None,
                detail: Some(value.message),
            })
        }
    };
    let Some(lock_entry) = lock.files.iter().find(|entry| {
        Path::new(&entry.file)
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(expected_name))
    }) else {
        return Some(ToolState {
            kind: kind.as_str().to_owned(),
            status: ToolStatus::ResourceMissing,
            path: None,
            version: None,
            detail: Some("内置工具清单中缺少所需程序；请重新构建资源。".to_owned()),
        });
    };
    let locked_path = root.join(&lock_entry.file);
    let path = if locked_path.is_file() {
        locked_path
    } else {
        find_file_under(root, expected_name).unwrap_or(locked_path)
    };
    if !path.is_file() || !is_path_within(root, &path) {
        return Some(ToolState {
            kind: kind.as_str().to_owned(),
            status: ToolStatus::ResourceMissing,
            path: None,
            version: None,
            detail: Some("未找到内置仿真工具；请重新安装或查看诊断。".to_owned()),
        });
    }
    let actual = match sha256_file(&path) {
        Ok(value) => value,
        Err(value) => {
            return Some(ToolState {
                kind: kind.as_str().to_owned(),
                status: ToolStatus::HashMismatch,
                path: None,
                version: None,
                detail: Some(value.message),
            })
        }
    };
    if !actual.eq_ignore_ascii_case(&lock_entry.sha256) {
        return Some(ToolState {
            kind: kind.as_str().to_owned(),
            status: ToolStatus::HashMismatch,
            path: None,
            version: None,
            detail: Some("内置工具身份校验失败；请重新安装官方资源。".to_owned()),
        });
    }
    let mut state = tool_from_path(kind, Some(&path));
    if state.status == ToolStatus::Available {
        state.detail = Some("内置 NIST 仿真引擎已通过身份校验。".to_owned());
    }
    Some(state)
}

fn push_unique_tool_root(roots: &mut Vec<PathBuf>, root: PathBuf) {
    if !roots.iter().any(|existing| existing == &root) {
        roots.push(root);
    }
}

fn add_packaged_tool_root_variants(roots: &mut Vec<PathBuf>, base: &Path) {
    push_unique_tool_root(roots, base.join("runtime").join("contam-tools"));
    push_unique_tool_root(roots, base.join("contam-tools"));
}

fn bundled_tool_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    #[cfg(debug_assertions)]
    if let Ok(value) = std::env::var("CONTAM_STUDIO_CONTAM_TOOLS_DIR") {
        let path = PathBuf::from(value);
        if path.is_absolute() {
            push_unique_tool_root(&mut roots, path);
        }
    }
    if let Ok(resource) = app.path().resource_dir() {
        // Tauri's bundled resource directory is normally `<install>\\resources`,
        // while the CONTAM runtime is deliberately packaged as a sibling at
        // `<install>\\runtime\\contam-tools`. Keep the resource-relative probes
        // for development layouts, then probe the executable directory used by
        // NSIS/MSI and Portable bundles.
        add_packaged_tool_root_variants(&mut roots, &resource);
        if let Some(exe_dir) = resource.parent() {
            add_packaged_tool_root_variants(&mut roots, exe_dir);
        }
    }
    if let Ok(exe_dir) = app.path().executable_dir() {
        add_packaged_tool_root_variants(&mut roots, &exe_dir);
    }
    roots
}

fn resolve_tool(app: &AppHandle, kind: ToolKind, legacy_path: Option<&Path>) -> ToolState {
    for root in bundled_tool_roots(app) {
        if let Some(state) = bundled_tool_from_root(&root, kind.clone()) {
            return state;
        }
    }
    // Legacy user paths remain a diagnostic-only fallback for older installs;
    // the normal UI never offers or writes them.
    tool_from_path(kind, legacy_path)
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
    let (version, probe_text) = match &kind {
        ToolKind::Contamx => match command_probe_version(path) {
            Ok(value) => value,
            Err(detail) => {
                return ToolState {
                    kind: kind_name,
                    status: ToolStatus::ProbeFailed,
                    path: Some(path_string),
                    version: None,
                    detail: Some(detail.to_owned()),
                }
            }
        },
        // Official SimRead does not expose a version switch. Its Windows
        // VERSIONINFO resource is the same identity evidence used by the
        // Python runner, so probing it must not invoke SimRead with a fake
        // input file such as `--version.sim`.
        ToolKind::Simread => (windows_file_version(path), String::new()),
    };
    if version.is_none() {
        return ToolState {
            kind: kind_name,
            status: ToolStatus::ProbeFailed,
            path: Some(path_string),
            version: None,
            detail: Some(
                match kind {
                    ToolKind::Contamx => "版本输出不可识别。",
                    ToolKind::Simread => "无法读取Windows版本资源。",
                }
                .to_owned(),
            ),
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
    if probe_text.to_ascii_lowercase().contains("32-bit") && std::env::consts::ARCH.contains("64") {
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

fn version_probe_argument(kind: &ToolKind) -> Option<&'static str> {
    match kind {
        ToolKind::Contamx => Some("--Version"),
        ToolKind::Simread => None,
    }
}

fn command_probe_version(path: &Path) -> Result<(Option<String>, String), &'static str> {
    let mut command = Command::new(path);
    // ContamX 3.4.x uses a capital V; `--version` is rejected by the
    // official executable and only prints its help text.
    command
        .arg(version_probe_argument(&ToolKind::Contamx).expect("ContamX probe argument"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = ControlledChild::spawn(&mut command).map_err(|_| "无法启动版本探测。")?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() >= PROBE_TIMEOUT => {
                let _ = child.kill();
                return Err("版本探测超时。");
            }
            Ok(None) => thread::sleep(Duration::from_millis(30)),
            Err(_) => return Err("读取版本探测状态失败。"),
        }
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "读取版本探测输出失败。")?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let text = combined.chars().take(MAX_PROBE_OUTPUT).collect::<String>();
    Ok((version_token(&text), text))
}

#[cfg(windows)]
fn windows_file_version(path: &Path) -> Option<String> {
    #[repr(C)]
    struct FixedFileInfo {
        signature: u32,
        _struct_version: u32,
        file_version_ms: u32,
        file_version_ls: u32,
        _product_version_ms: u32,
        _product_version_ls: u32,
        _file_flags_mask: u32,
        _file_flags: u32,
        _file_os: u32,
        _file_type: u32,
        _file_subtype: u32,
        _file_date_ms: u32,
        _file_date_ls: u32,
    }

    let file_name: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let size = unsafe { GetFileVersionInfoSizeW(file_name.as_ptr(), std::ptr::null_mut()) };
    if size == 0 {
        return None;
    }
    let mut buffer = vec![0_u8; size as usize];
    let loaded = unsafe {
        GetFileVersionInfoW(
            file_name.as_ptr(),
            0,
            size,
            buffer.as_mut_ptr() as *mut c_void,
        )
    };
    if loaded == 0 {
        return None;
    }
    let query = [92_u16, 0_u16];
    let mut value: *mut c_void = std::ptr::null_mut();
    let mut value_len = 0_u32;
    let queried = unsafe {
        VerQueryValueW(
            buffer.as_ptr() as *const c_void,
            query.as_ptr(),
            &mut value,
            &mut value_len,
        )
    };
    if queried == 0
        || value.is_null()
        || (value_len as usize) < std::mem::size_of::<FixedFileInfo>()
    {
        return None;
    }
    let info = unsafe { std::ptr::read_unaligned(value as *const FixedFileInfo) };
    if info.signature != 0xFEEF04BD {
        return None;
    }
    Some(format!(
        "{}.{}.{}.{}",
        info.file_version_ms >> 16,
        info.file_version_ms & 0xFFFF,
        info.file_version_ls >> 16,
        info.file_version_ls & 0xFFFF
    ))
}

#[cfg(not(windows))]
fn windows_file_version(_path: &Path) -> Option<String> {
    None
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
        contamx: resolve_tool(app, ToolKind::Contamx, contamx.as_deref()),
        simread: resolve_tool(app, ToolKind::Simread, simread.as_deref()),
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
    _contamx_path: Option<String>,
    _simread_path: Option<String>,
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
    if let Err(value) = write_config(&app, true, &language, &theme, &data, None, None) {
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
        "app-data" => match app.path().app_local_data_dir() {
            Ok(value) => value,
            Err(_) => {
                return DesktopActionResponse {
                    request_id,
                    succeeded: false,
                    error: Some(error("", "directory_unavailable", "无法访问应用数据目录。")),
                }
            }
        },
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

fn measure_directory(root: &Path) -> (u64, u64) {
    if !root.is_dir() {
        return (0, 0);
    }
    let mut stack = vec![root.to_path_buf()];
    let mut file_count = 0_u64;
    let mut bytes = 0_u64;
    while let Some(directory) = stack.pop() {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() {
                file_count = file_count.saturating_add(1);
                bytes = bytes.saturating_add(metadata.len());
            }
        }
    }
    (file_count, bytes)
}

fn storage_category_paths(
    app: &AppHandle,
) -> Result<Vec<(&'static str, &'static str, PathBuf)>, SetupError> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("", "directory_unavailable", "无法访问应用数据目录。"))?;
    let logs = app
        .path()
        .app_log_dir()
        .map_err(|_| error("", "directory_unavailable", "无法访问日志目录。"))?;
    Ok(vec![
        ("EBWebView", "cache", root.join("EBWebView")),
        ("project-drafts", "user_data", root.join("project-drafts")),
        ("runs", "user_data", root.join("runs")),
        (
            "result-extractions",
            "user_data",
            root.join("result-extractions"),
        ),
        ("study-runs", "user_data", root.join("study-runs")),
        ("study-reports", "user_data", root.join("study-reports")),
        ("logs", "cache", logs),
    ])
}

#[tauri::command]
pub fn get_storage_usage(app: AppHandle, request_id: String) -> DesktopStorageUsageResponse {
    if !valid_request(&request_id) {
        return DesktopStorageUsageResponse {
            request_id,
            usage: None,
            error: Some(error("", "bridge_request_invalid", "request_id无效。")),
        };
    }
    let categories = match storage_category_paths(&app) {
        Ok(value) => value,
        Err(value) => {
            return DesktopStorageUsageResponse {
                request_id,
                usage: None,
                error: Some(value),
            }
        }
    };
    let categories = categories
        .into_iter()
        .map(|(id, kind, path)| {
            let (file_count, bytes) = measure_directory(&path);
            StorageCategoryView {
                id: id.to_owned(),
                kind: kind.to_owned(),
                file_count,
                bytes,
            }
        })
        .collect();
    DesktopStorageUsageResponse {
        request_id,
        usage: Some(StorageUsageView {
            root_label: "app_local_data".to_owned(),
            categories,
        }),
        error: None,
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
    fn official_tool_probe_contract_matches_the_real_binaries() {
        assert_eq!(
            version_probe_argument(&ToolKind::Contamx),
            Some("--Version")
        );
        assert_eq!(version_probe_argument(&ToolKind::Simread), None);
        assert_eq!(version_token("3.4.0.3 64 bit"), Some("3.4.0.3".to_owned()));
    }

    #[test]
    fn packaged_tool_roots_cover_executable_sibling_runtime_layout() {
        let mut roots = Vec::new();
        add_packaged_tool_root_variants(&mut roots, Path::new(r"F:\CONTAM Studio"));
        assert!(roots.contains(&PathBuf::from(r"F:\CONTAM Studio\runtime\contam-tools")));
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

    #[test]
    fn atomic_config_migration_preserves_previous_snapshot() {
        let root = std::env::temp_dir().join(format!(
            "contam-studio-agent-07-config-{}",
            TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("temp config directory");
        let path = root.join(CONFIG_FILE_NAME);
        let old = br#"{"schema_version":0,"language":"zh-CN"}"#;
        let new = br#"{"schema_version":1,"language":"en"}"#;
        atomic_write(&path, old).expect("write initial config");
        atomic_write(&path, new).expect("migrate config");
        assert_eq!(fs::read(&path).expect("new config"), new);
        assert_eq!(
            fs::read(root.join(format!(".{CONFIG_FILE_NAME}.previous"))).expect("previous config"),
            old
        );
        fs::remove_dir_all(root).expect("cleanup temp config directory");
    }

    #[test]
    fn sanitized_diagnostics_never_expose_paths_or_project_content() {
        let setup = StudioSetup {
            schema_version: CONFIG_SCHEMA_VERSION,
            first_run_complete: true,
            language: "zh-CN".to_owned(),
            theme: "dark".to_owned(),
            data_directory: r#"F:\Users\example\CONTAM\projects"#.to_owned(),
            contamx: ToolState {
                kind: "contamx".to_owned(),
                status: ToolStatus::Available,
                path: Some(r#"F:\Tools\contamx3.exe"#.to_owned()),
                version: Some("3.4.0.3".to_owned()),
                detail: None,
            },
            simread: ToolState::unconfigured(ToolKind::Simread),
            runtime: RuntimeInfo {
                app_version: "0.1.0".to_owned(),
                commit_sha: "abc123".to_owned(),
                build_kind: "release".to_owned(),
                dirty: false,
                architecture: "x86_64".to_owned(),
                operating_system: "Windows_NT".to_owned(),
            },
            storage: StorageLayout {
                data_directory: r#"F:\Users\example\CONTAM\projects"#.to_owned(),
                config_directory: r#"C:\Users\example\AppData\config"#.to_owned(),
                cache_directory: r#"C:\Users\example\AppData\cache"#.to_owned(),
                log_directory: r#"C:\Users\example\AppData\logs"#.to_owned(),
                temporary_directory: r#"C:\Users\example\AppData\temp"#.to_owned(),
            },
        };
        let text = serde_json::to_string(&sanitized_setup(&setup)).expect("diagnostics JSON");
        assert!(text.contains("configured_local_data"));
        assert!(text.contains("recent_run_status"));
        assert!(!text.contains("F:\\\\Users"));
        assert!(!text.contains("C:\\\\Users"));
        assert!(!text.contains("contamx3.exe"));
    }
}
