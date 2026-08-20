import { useEffect, useState } from "react";
import type { ProjectState } from "../../../app/project-state";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import type { AttachmentState } from "../../../app/attachment-state";
import { useGeometryWorkbench } from "../../../app/runtime/useGeometryWorkbench";
import { useGeometryVisionDraft, type GeometryVisionDraftController } from "../../../app/runtime/useGeometryVisionDraft";
import {
  GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
  toggleGeometryAiOperationSelection,
  type GeometryAiDraft,
} from "../../../app/geometry/geometry-ai-draft";
import planSourceDemo from "../../../assets/ai-plan-source-demo.jpg";
import i18n from "../../../i18n";
import { GeometryWorkbench } from "./GeometryWorkbench";
import { GeometryVisionDraftPanel } from "../assistant/GeometryVisionDraftPanel";

const sourceSha = "b".repeat(64);
const identitySha = "a".repeat(64);

const projectState: ProjectState = {
  status: "loaded",
  activeSequence: null,
  activeRequestId: null,
  projectSessionId: "geometry-quality-project",
  project: {
    schema_version: "1.0",
    reader_mode: "quality_fixture",
    source_path: "Teaching Office.prj",
    source_sha256: sourceSha,
    source_size_bytes: 42_000,
    source_unchanged: true,
    header_version: "3.4.0.4",
    header_variant: 0,
    declared_zone_count: 3,
    zones: [
      { zone_id: "zone-1", contam_number: 1, name: "开放办公区", flags: 0, level_number: 1, relative_height: 0, volume_m3: 98, source_line_number: 1 },
      { zone_id: "zone-2", contam_number: 2, name: "会议室", flags: 0, level_number: 1, relative_height: 0, volume_m3: 54, source_line_number: 2 },
      { zone_id: "zone-3", contam_number: 3, name: "设备与交通区", flags: 0, level_number: 1, relative_height: 0, volume_m3: 80, source_line_number: 3 },
    ],
    first_zone: null,
    diagnostics: [],
  },
  draft: { revision_id: "revision-quality-1", revision_number: 7, history_tip: 7, dirty: false, exported: false, can_undo: true, can_redo: false },
  selectedZoneKey: "zone-1",
  issue: null,
};

const unavailableSpatial = {
  schema_version: "spatial_projection.v1",
  status: "unavailable",
  project_session_id: "geometry-quality-project",
  identity_sha256: identitySha,
  source_sha256: sourceSha,
  revision_id: "revision-quality-1",
  levels: [],
  warnings: [],
  unavailable_reason: "spatial_section_missing",
};

const snapshot = {
  result_type: "semantic_project_snapshot",
  source_sha256: sourceSha,
  identity_sha256: identitySha,
  revision_state: "draft",
  project: { object_id: "project-quality", name: "Teaching Office" },
  levels: [{ object_id: "semantic-level-1", level_number: 1, name: "首层平面" }],
  zones: [
    { object_id: "zone-1", name: "开放办公区", contam_number: 1, level_number: 1 },
    { object_id: "zone-2", name: "会议室", contam_number: 2, level_number: 1 },
    { object_id: "zone-3", name: "设备与交通区", contam_number: 3, level_number: 1 },
  ],
  flow_paths: [
    { object_id: "flow-1", label: "会议室门缝流路", contam_number: 1 },
    { object_id: "flow-2", label: "外窗渗透流路", contam_number: 2 },
  ],
  schedules: [],
  species: [],
  sources: [],
  sections: [],
  spatial_projection: unavailableSpatial,
  read_only_reason: null,
} as unknown as SemanticSnapshot;

const qualityAttachmentState: AttachmentState = {
  attachments: [{
    attachment_id: "demo-floor-plan-attachment",
    display_name: "ai-plan-source-demo.jpg",
    category: "image",
    size_bytes: 48000,
    sha256_prefix: "c".repeat(12),
    status: "ready",
    risk_summary: "image metadata only",
    metadata: { mime_type: "image/jpeg" },
    evidence_kind: null,
    selected_by_user: true,
  }],
  busy: false,
  bundle: null,
  issue: null,
};

const qualityAiDraft: GeometryAiDraft = {
  schema_version: GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
  project_session_id: "geometry-quality-project",
  revision_id: "revision-quality-1",
  baseline_geometry_hash: "a".repeat(64),
  attachment_sha256: "b".repeat(64),
  summary: "教学办公区扩展识别草案",
  observations: ["识别到新增走廊隔墙与端点", "识别到走廊连接门洞构造"],
  measurement_basis: "scaled_reference",
  confidence_percent: 94,
  assumptions: ["按基线 250 mm 模数与真实毫米网格对齐"],
  warnings: ["建议核对新增隔墙与现有开放办公区 Zone 边界关系"],
  operations: [
    {
      operation: "add_vertex",
      parameters: { level_id: "studio-level-1", vertex: { id: "demo-ai-v-1", x: 7000, y: 4500 } },
    },
    {
      operation: "add_vertex",
      parameters: { level_id: "studio-level-1", vertex: { id: "demo-ai-v-2", x: 9500, y: 4500 } },
    },
    {
      operation: "add_wall",
      parameters: {
        level_id: "studio-level-1",
        wall: {
          id: "demo-ai-w-1",
          start_vertex_id: "demo-ai-v-1",
          end_vertex_id: "demo-ai-v-2",
          kind: "interior",
          thickness: 240,
          source_icon_id: null,
        },
      },
    },
    {
      operation: "place_opening",
      parameters: {
        level_id: "studio-level-1",
        opening: {
          id: "demo-ai-op-1",
          wall_id: "demo-ai-w-1",
          kind: "door",
          offset: 500,
          width: 900,
          swing: "left",
          adjacent_zone_ids: [],
        },
      },
    },
  ],
};

export function GeometryQualityHarness() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selectedOpIndices, setSelectedOpIndices] = useState<number[]>([0, 1, 2, 3]);
  const [autoIncludedOpIndices, setAutoIncludedOpIndices] = useState<number[]>([]);
  const controller = useGeometryWorkbench(projectState, snapshot);
  const geometryVisionDraft = useGeometryVisionDraft(projectState, controller);
  const qualityAiDemo = new URLSearchParams(window.location.search).get("ai-demo") !== "off";

  useEffect(() => {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as unknown as {
        __contamGeometryQuality?: {
          setLanguage: (language: string) => Promise<void>;
          getLanguage: () => string;
        };
      }).__contamGeometryQuality = {
        setLanguage: async (language: string) => {
          await i18n.changeLanguage(language);
        },
        getLanguage: () => i18n.language,
      };
    }
    controller.loadTeachingExample();
    controller.setSelectedZoneId("zone-1");
    controller.setSelection({ kind: "wall", id: "demo-w-3" });

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __contamGeometryQuality?: unknown }).__contamGeometryQuality;
      }
    };
  }, [controller.loadTeachingExample]);

  const handleToggleOperation = (index: number) => {
    if (!controller.history?.geometry) return;
    const change = toggleGeometryAiOperationSelection(
      qualityAiDraft,
      controller.history.geometry,
      selectedOpIndices,
      index,
    );
    setSelectedOpIndices(change.selectedIndices);
    setAutoIncludedOpIndices(change.autoIncludedIndices);
  };

  const assistantController: GeometryVisionDraftController = {
    ...geometryVisionDraft,
    status: "ready",
    draft: qualityAiDraft,
    selectedOperationIndices: selectedOpIndices,
    autoIncludedOperationIndices: autoIncludedOpIndices,
    toggleOperation: handleToggleOperation,
    setAllOperationsSelected: (selected) => {
      setSelectedOpIndices(selected ? [0, 1, 2, 3] : []);
      setAutoIncludedOpIndices([]);
    },
    confirm: () => {
      setAssistantOpen(false);
      return true;
    },
  };

  return (
    <main className="geometry-quality-harness">
      <div className={`geometry-quality-layout ${assistantOpen ? "has-assistant" : ""}`}>
        <GeometryWorkbench
          projectState={projectState}
          snapshot={snapshot}
          controller={controller}
          geometryVisionDraft={geometryVisionDraft}
          selectedSemanticObjectId="zone-1"
          onSelectSemantic={() => undefined}
          onOpenAssistant={() => setAssistantOpen((value) => !value)}
          qualityAiDemo={qualityAiDemo}
          qualityAiDemoSource={planSourceDemo}
        />
        {assistantOpen ? (
          <aside className="geometry-quality-assistant" aria-label="AI Assistant Panel">
            <header className="geometry-quality-assistant-header">
              <strong>AI 建筑草案助手</strong>
              <button type="button" aria-label="Close Assistant" onClick={() => setAssistantOpen(false)}>×</button>
            </header>
            <GeometryVisionDraftPanel
              controller={assistantController}
              geometryAvailable={Boolean(controller.history?.geometry)}
              codexVisionReady={true}
              attachmentState={qualityAttachmentState}
              onAttachmentImport={() => undefined}
              onAttachmentSelect={() => undefined}
            />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
