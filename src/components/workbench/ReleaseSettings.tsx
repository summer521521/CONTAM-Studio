import { CheckCircle2, Clipboard, Database, Download, FolderOpen, HardDrive, RefreshCw, Settings2, Trash2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLanguage, AppTheme } from "../../app/workbench-state";
import { displayVersion } from "../../app/build-info";
import type { StudioSetup, ToolKind } from "../../app/release-state";
import { toolStatusLabel } from "../../app/release-state";

interface ReleaseSettingsProps {
  setup: StudioSetup | null;
  language: AppLanguage;
  theme: AppTheme;
  busy: boolean;
  onChooseDataDirectory: () => Promise<string | null>;
  onProbeTool: (kind: ToolKind) => Promise<import("../../app/release-state").ToolState | null>;
  onSave: (dataDirectory: string, contamxPath: string | null, simreadPath: string | null) => Promise<void>;
  onOpenDirectory: (kind: "data" | "logs" | "cache") => Promise<void>;
  onClearCache: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onExportDiagnostics: () => Promise<void>;
}

function text(language: AppLanguage, zh: string, en: string): string {
  return language === "en" ? en : zh;
}

export function ReleaseSettings({ setup, language, theme, busy, onChooseDataDirectory, onProbeTool, onSave, onOpenDirectory, onClearCache, onCopyDiagnostics, onExportDiagnostics }: ReleaseSettingsProps) {
  const [dataDirectory, setDataDirectory] = useState(setup?.data_directory ?? "");
  const [contamxPath, setContamxPath] = useState(setup?.contamx.path ?? null);
  const [simreadPath, setSimreadPath] = useState(setup?.simread.path ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!setup) return;
    setDataDirectory(setup.data_directory);
    setContamxPath(setup.contamx.path);
    setSimreadPath(setup.simread.path);
  }, [setup]);

  const chooseData = async () => {
    const selected = await onChooseDataDirectory();
    if (selected) setDataDirectory(selected);
  };
  const probe = async (kind: ToolKind) => {
    const probed = await onProbeTool(kind);
    if (probed?.path) {
      if (kind === "contamx") setContamxPath(probed.path);
      else setSimreadPath(probed.path);
    }
    setNotice(text(language, "已完成工具探测；点击保存配置后生效。", "Tool probe completed; save the configuration to apply it."));
  };
  const save = async () => {
    if (!dataDirectory.trim()) return;
    await onSave(dataDirectory.trim(), contamxPath, simreadPath);
    setNotice(text(language, "配置已保存。", "Configuration saved."));
  };
  const tool = (kind: ToolKind) => kind === "contamx" ? setup?.contamx : setup?.simread;
  const status = (kind: ToolKind) => {
    const current = tool(kind);
    return current ? toolStatusLabel(current.status, language) : text(language, "未探测", "Not probed");
  };

  return (
    <section className="release-settings" aria-label={text(language, "安装和运行配置", "Installation and runtime settings")}>
      <div className="release-callout">
        <Wrench size={20} aria-hidden="true" />
        <div>
          <strong>{setup?.first_run_complete ? text(language, "配置中心", "Configuration center") : text(language, "首次启动向导", "First-start wizard")}</strong>
          <p>{text(language, "选择本地数据目录并探测官方工具。未配置工具时仍可打开项目、编辑草稿和查看历史结果。", "Choose a local data directory and probe the official tools. Projects, drafts, and historical results remain available without configured tools.")}</p>
        </div>
      </div>
      <div className="release-grid">
        <div className="release-card">
          <div className="release-card-heading"><Database size={17} /><strong>{text(language, "数据目录", "Data directory")}</strong></div>
          <p className="release-muted">{text(language, "用户工程和已保存结果不会写入安装目录。", "Projects and saved results never go into the install directory.")}</p>
          <div className="release-path-row"><code>{dataDirectory || text(language, "尚未选择", "Not selected")}</code><button className="secondary-action" type="button" disabled={busy} onClick={() => void chooseData()}><FolderOpen size={15} />{text(language, "选择", "Choose")}</button></div>
        </div>
        <div className="release-card">
          <div className="release-card-heading"><HardDrive size={17} /><strong>{text(language, "官方工具", "Official tools")}</strong></div>
          <div className="release-tool-row"><div><strong>ContamX</strong><span>{status("contamx")}</span>{tool("contamx")?.version ? <code>{tool("contamx")?.version}</code> : null}</div><button className="secondary-action" type="button" disabled={busy} onClick={() => void probe("contamx")}>{text(language, "选择并探测", "Choose and probe")}</button></div>
          <div className="release-tool-row"><div><strong>SimRead</strong><span>{status("simread")}</span>{tool("simread")?.version ? <code>{tool("simread")?.version}</code> : null}</div><button className="secondary-action" type="button" disabled={busy} onClick={() => void probe("simread")}>{text(language, "选择并探测", "Choose and probe")}</button></div>
          <p className="release-muted">{text(language, "只使用固定的--version探测，不执行用户输入的命令。", "Only the fixed --version probe is used; user input is never executed as a command.")}</p>
        </div>
      </div>
      <div className="release-actions">
        <button className="primary-action" type="button" disabled={busy || !dataDirectory.trim()} onClick={() => void save()}><CheckCircle2 size={16} />{text(language, "保存配置", "Save configuration")}</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void onOpenDirectory("data")}><FolderOpen size={16} />{text(language, "打开数据目录", "Open data directory")}</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void onOpenDirectory("logs")}><FolderOpen size={16} />{text(language, "打开日志目录", "Open logs")}</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void onOpenDirectory("cache")}><RefreshCw size={16} />{text(language, "打开缓存目录", "Open cache")}</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void onClearCache()}><Trash2 size={16} />{text(language, "清理缓存", "Clear cache")}</button>
      </div>
      <div className="release-card release-about">
        <div className="release-card-heading"><Settings2 size={17} /><strong>{text(language, "关于和诊断", "About and diagnostics")}</strong></div>
        <div className="release-runtime-grid">
          <span>{text(language, "版本", "Version")}</span><code>{setup ? `${setup.runtime.app_version}${setup.runtime.dirty ? "-dev" : ""}` : displayVersion()}</code>
          <span>commit SHA</span><code>{setup?.runtime.commit_sha ?? "unknown"}</code>
          <span>{text(language, "架构", "Architecture")}</span><code>{setup?.runtime.architecture ?? "unknown"}</code>
          <span>{text(language, "语言/主题", "Language / theme")}</span><code>{language} / {theme}</code>
          <span>{text(language, "数据目录", "Data directory")}</span><code>{(setup?.data_directory ?? dataDirectory) || "-"}</code>
        </div>
        <div className="release-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={() => void onCopyDiagnostics()}><Clipboard size={16} />{text(language, "复制诊断摘要", "Copy diagnostics")}</button>
          <button className="secondary-action" type="button" disabled={busy} onClick={() => void onExportDiagnostics()}><Download size={16} />{text(language, "导出脱敏诊断包", "Export sanitized diagnostics")}</button>
        </div>
      </div>
      {notice ? <p className="release-notice" role="status">{notice}</p> : null}
    </section>
  );
}
