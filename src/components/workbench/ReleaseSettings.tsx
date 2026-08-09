import { CheckCircle2, Clipboard, Database, Download, FolderOpen, HardDrive, Settings2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLanguage, AppTheme } from "../../app/workbench-state";
import { displayVersion } from "../../app/build-info";
import type { StorageUsageView, StudioSetup, ToolKind, ToolState } from "../../app/release-state";
import { toolStatusLabel } from "../../app/release-state";
import { HoverHint } from "./HoverHint";

interface ReleaseSettingsProps {
  setup: StudioSetup | null;
  language: AppLanguage;
  theme: AppTheme;
  busy: boolean;
  onChooseDataDirectory: () => Promise<string | null>;
  onProbeTool: (kind: ToolKind) => Promise<ToolState | null>;
  onSaveDataDirectory: (dataDirectory: string) => Promise<void>;
  onOpenDirectory: (kind: "data" | "app-data" | "logs" | "cache") => Promise<void>;
  onClearCache: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onExportDiagnostics: () => Promise<void>;
  storageUsage?: StorageUsageView | null;
  section?: "overview" | "tools" | "storage" | "diagnostics";
}

function text(language: AppLanguage, zh: string, en: string): string {
  return language === "en" ? en : zh;
}

function formatBytes(bytes: number, language: AppLanguage): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = language === "en" ? ["KB", "MB", "GB"] : ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

function categoryLabel(id: string, language: AppLanguage): string {
  const labels: Record<string, [string, string]> = {
    EBWebView: ["WebView缓存", "WebView cache"],
    "project-drafts": ["项目草稿", "Project drafts"],
    runs: ["运行记录", "Run records"],
    "result-extractions": ["结果提取", "Result extractions"],
    "study-runs": ["研究任务", "Study runs"],
    "study-reports": ["研究报告", "Study reports"],
    logs: ["日志", "Logs"],
  };
  const value = labels[id];
  return value ? text(language, value[0], value[1]) : id;
}

function toolStatus(tool: ToolState | undefined, language: AppLanguage): string {
  if (!tool) return text(language, "检查中", "Checking");
  if (tool.status === "available" && tool.version) {
    const label = tool.kind === "simread" ? "SimRead" : "ContamX";
    return text(language, `已就绪 · ${label} ${tool.version}`, `Ready · ${label} ${tool.version}`);
  }
  return toolStatusLabel(tool.status, language);
}

export function ReleaseSettings({
  setup,
  language,
  theme,
  busy,
  onChooseDataDirectory,
  onProbeTool,
  onSaveDataDirectory,
  onOpenDirectory,
  onClearCache: _onClearCache,
  onCopyDiagnostics,
  onExportDiagnostics,
  storageUsage = null,
  section = "overview",
}: ReleaseSettingsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dataDirectory, setDataDirectory] = useState(setup?.data_directory ?? "");
  const [probeResults, setProbeResults] = useState<Partial<Record<ToolKind, ToolState>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!setup) return;
    setDataDirectory(setup.data_directory);
  }, [setup]);

  const chooseData = async () => {
    const selected = await onChooseDataDirectory();
    if (selected) setDataDirectory(selected);
  };
  const probe = async (kind: ToolKind) => {
    const probed = await onProbeTool(kind);
    if (probed) setProbeResults((current) => ({ ...current, [kind]: probed }));
    setNotice(text(language, "已完成只读诊断；不会改变运行配置。", "Read-only diagnostic completed; runtime configuration was not changed."));
  };
  const save = async () => {
    if (!dataDirectory.trim()) return;
    await onSaveDataDirectory(dataDirectory.trim());
    setNotice(text(language, "数据目录已保存。", "Data directory saved."));
  };

  const showTools = section === "overview" || section === "tools";
  const showStorage = section === "overview" || section === "storage";
  const showDiagnostics = section === "overview" || section === "diagnostics";

  return (
    <section className="release-settings" aria-label={text(language, "本地运行与存储", "Local runtime and storage")}>
      {section === "overview" ? (
        <div className="release-callout">
          <Wrench size={20} aria-hidden="true" />
          <strong>{text(language, "本地优先，联网增强", "Local first, online enhanced")}<HoverHint label={text(language, "项目、仿真和用户文件留在本机；联网只在你主动使用 Provider 或官方服务时发生。", "Projects, simulations, and user files stay local; network access occurs only when you actively use a Provider or official service.")} /></strong>
        </div>
      ) : null}

      {showTools ? (
        <div className="release-card" aria-labelledby="release-tools-title">
          <div className="release-card-heading"><HardDrive size={17} /><strong id="release-tools-title">{text(language, "仿真引擎", "Simulation engine")} <HoverHint label={text(language, "优先使用随应用提供并已校验的官方 NIST 工具。", "Verified official NIST tools shipped with the app are preferred.")} /></strong></div>
          <div className="release-tool-row"><div><strong>ContamX</strong><span>{toolStatus(setup?.contamx, language)}</span></div><span aria-label={text(language, "ContamX状态", "ContamX status")}>{setup?.contamx.status === "available" ? "✓" : "—"}</span></div>
          <div className="release-tool-row"><div><strong>SimRead</strong><span>{setup?.simread.status === "available" && setup.simread.version ? text(language, `已就绪 · SimRead ${setup.simread.version}`, `Ready · SimRead ${setup.simread.version}`) : toolStatus(setup?.simread, language)}</span></div><span aria-label={text(language, "SimRead状态", "SimRead status")}>{setup?.simread.status === "available" ? "✓" : "—"}</span></div>
          <details className="release-advanced" open={section === "overview" ? advancedOpen : undefined} onToggle={section === "overview" ? (event) => setAdvancedOpen(event.currentTarget.open) : undefined}>
            <summary>{text(language, "旧版工具只读诊断", "Read-only legacy tool diagnostics")}</summary>
            <p className="release-muted">{text(language, "仅用于临时诊断，不会改变运行配置或保存工具路径。", "For temporary diagnostics only; it does not change runtime configuration or save tool paths.")}</p>
            {(["contamx", "simread"] as ToolKind[]).map((kind) => {
              const result = probeResults[kind];
              return <div className="release-tool-row" key={kind}><span>{kind === "contamx" ? "ContamX" : "SimRead"}{result ? ` · ${toolStatus(result, language)}` : ""}</span><button className="secondary-action" type="button" disabled={busy} onClick={() => void probe(kind)}>{text(language, "选择并探测", "Choose and probe")}</button></div>;
            })}
          </details>
        </div>
      ) : null}

      {showStorage ? (
        <div className="release-card" aria-labelledby="release-storage-title">
          <div className="release-card-heading"><Database size={17} /><strong id="release-storage-title">{text(language, "本地存储", "Local storage")} <HoverHint label={text(language, "只统计白名单目录中的文件数量和大小，不读取文件正文。", "Only file counts and sizes from the allowlisted directories are read; file contents are not read.")} /></strong></div>
          <div className="release-storage-list" aria-live="polite">
            {storageUsage?.categories.map((category) => <div className="release-storage-row" key={category.id}><span>{categoryLabel(category.id, language)}</span><span>{category.file_count} · {formatBytes(category.bytes, language)}</span></div>)}
            {!storageUsage ? <p className="release-muted">{text(language, "正在读取存储统计…", "Loading storage statistics…")}</p> : null}
          </div>
          <div className="release-actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => void onOpenDirectory("app-data")}><FolderOpen size={16} />{text(language, "打开应用数据文件夹", "Open app data folder")}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void onOpenDirectory("data")}><FolderOpen size={16} />{text(language, "打开项目数据目录", "Open project data folder")}</button></div>
          <details className="release-advanced">
            <summary>{text(language, "数据目录设置", "Data directory settings")}</summary>
            <div className="release-path-row"><code>{dataDirectory || text(language, "尚未选择", "Not selected")}</code><button className="secondary-action" type="button" disabled={busy} onClick={() => void chooseData()}><FolderOpen size={15} />{text(language, "选择", "Choose")}</button></div>
            <button className="primary-action" type="button" disabled={busy || !dataDirectory.trim()} onClick={() => void save()}><CheckCircle2 size={16} />{text(language, "保存配置", "Save configuration")}</button>
          </details>
        </div>
      ) : null}

      {showDiagnostics ? (
        <div className="release-card">
          <div className="release-card-heading"><Settings2 size={17} /><strong>{text(language, "运行诊断", "Runtime diagnostics")}</strong></div>
          <div className="release-runtime-grid">
            <span>{text(language, "版本", "Version")}</span><code>{setup ? `${setup.runtime.app_version}${setup.runtime.dirty ? "-dev" : ""}` : displayVersion()}</code>
            <span>commit SHA</span><code>{setup?.runtime.commit_sha ?? "unknown"}</code>
            <span>{text(language, "架构", "Architecture")}</span><code>{setup?.runtime.architecture ?? "unknown"}</code>
            <span>{text(language, "语言/主题", "Language / theme")}</span><code>{language} / {theme}</code>
          </div>
          <div className="release-actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => void onCopyDiagnostics()}><Clipboard size={16} />{text(language, "复制诊断摘要", "Copy diagnostics")}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void onExportDiagnostics()}><Download size={16} />{text(language, "导出脱敏诊断包", "Export sanitized diagnostics")}</button></div>
        </div>
      ) : null}
      {notice ? <p className="release-notice" role="status">{notice}</p> : null}
    </section>
  );
}
