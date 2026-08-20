import { describe, expect, it } from "vitest";
import type { ProjectInspection } from "../project-state";
import type { SemanticSnapshot } from "../semantic-state";
import { createBlankBuildingGeometry, createTeachingBuildingGeometry, type GeometryDraftContext } from "./geometry-factories";
import { validateBuildingGeometry } from "./geometry-validation";

const sourceSha = "b".repeat(64);
const identitySha = "a".repeat(64);

function context(): GeometryDraftContext {
  const project = {
    schema_version: "1.0",
    reader_mode: "strict",
    source_path: "test.prj",
    source_sha256: sourceSha,
    source_size_bytes: 100,
    source_unchanged: true,
    header_version: "3.4",
    header_variant: 0,
    declared_zone_count: 3,
    zones: [],
    first_zone: null,
    diagnostics: [],
  } satisfies ProjectInspection;
  const snapshot = {
    result_type: "semantic_project_snapshot",
    source_sha256: sourceSha,
    identity_sha256: identitySha,
    revision_state: "draft",
    project: { object_id: "project" },
    levels: [{ object_id: "semantic-level-1", level_number: 1, name: "Ground floor" }],
    zones: [
      { object_id: "zone-1", name: "Classroom", contam_number: 1 },
      { object_id: "zone-2", name: "Corridor", contam_number: 2 },
      { object_id: "zone-3", name: "Laboratory", contam_number: 3 },
    ],
    flow_paths: [{ object_id: "flow-1", contam_number: 1 }],
    schedules: [],
    species: [],
    sources: [],
    sections: [],
    spatial_projection: null,
    read_only_reason: null,
  } as unknown as SemanticSnapshot;
  return { projectSessionId: "project-session-1", revisionId: "revision-1", project, snapshot };
}

describe("geometry draft factories", () => {
  it("creates an empty application-owned metric draft bound to current identity", () => {
    const model = createBlankBuildingGeometry(context());
    expect(model.project_session_id).toBe("project-session-1");
    expect(model.identity_sha256).toBe(identitySha);
    expect(model.levels[0].name).toBe("Ground floor");
    expect(model.levels[0].walls).toEqual([]);
    expect(validateBuildingGeometry(model, { expectedProjectSessionId: "project-session-1", expectedRevisionId: "revision-1" }).status).toBe("valid");
  });

  it("creates a valid, explicitly warned teaching example without PRJ round-trip capability", () => {
    const model = createTeachingBuildingGeometry(context());
    expect(model.levels[0].walls).toHaveLength(10);
    expect(model.levels[0].openings).toHaveLength(4);
    expect(model.levels[0].zone_regions.map((region) => region.semantic_zone_id)).toEqual(["zone-1", "zone-2", "zone-3"]);
    expect(model.capabilities.prj_round_trip).toBe("unsupported");
    expect(model.warnings.map((warning) => warning.code)).toContain("geometry_teaching_example_not_prj");
    expect(validateBuildingGeometry(model, { expectedProjectSessionId: "project-session-1", expectedRevisionId: "revision-1" }).status).toBe("valid");
  });
});
