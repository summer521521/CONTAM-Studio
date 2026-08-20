import { describe, expect, it } from "vitest";
import contractFixture from "../../../contracts/semantic-authoring/fixtures/valid-draft.json";
import {
  createEmptyContamSemanticDraft,
  isContamSemanticDraft,
  semanticDraftSha256,
  validateContamSemanticDraft,
  type ContamSemanticDraft,
  type ContamSemanticDraftContext,
} from "./contam-semantic-draft";

const identity = "a".repeat(64);
const source = "b".repeat(64);

function context(): ContamSemanticDraftContext {
  return {
    projectSessionId: "session-1",
    identitySha256: identity,
    sourceSha256: source,
    revisionId: "revision-1",
    levelNumbers: new Set([1, 2]),
    existingZoneIds: new Set(["existing-zone-1"]),
    supportedFlowElementIds: new Set(["flow-element-1"]),
  };
}

function draft(): ContamSemanticDraft {
  const value = createEmptyContamSemanticDraft(context(), "semantic-draft-1");
  value.draft_revision = 2;
  value.zones.push({
    id: "draft-zone-1",
    level_number: 1,
    name: "Office_1",
    display_name: "办公室 1",
    volume_litres: 48_000,
    volume_basis: "geometry_estimate_confirmed",
    geometry_region_id: "region-1",
    initial_temperature_millikelvin: 293_150,
    initial_pressure_millipascal: 0,
  });
  value.flow_paths.push({
    id: "draft-flow-1",
    level_number: 1,
    opening_id: "opening-1",
    from_endpoint: { kind: "zone", zone_id: "draft-zone-1" },
    to_endpoint: { kind: "zone", zone_id: "existing-zone-1" },
    flow_element_id: "flow-element-1",
    multiplier_millionths: 1_000_000,
    x_mm: 4_000,
    y_mm: 2_000,
    relative_height_mm: 1_500,
    direction_degrees: -1,
  });
  return value;
}

describe("CONTAM semantic authoring draft", () => {
  it("shares the canonical contract hash with Python and Rust", () => {
    expect(isContamSemanticDraft(contractFixture)).toBe(true);
    expect(semanticDraftSha256(contractFixture as ContamSemanticDraft)).toBe(
      "08ebf8937b1640ca13a55b701a84e3b83b05e77c665e5986ec4a795018229586",
    );
  });

  it("accepts deterministic fixed-point Zone and Airflow Path facts", () => {
    const value = draft();
    expect(isContamSemanticDraft(value)).toBe(true);
    expect(validateContamSemanticDraft(value, context())).toEqual({
      status: "valid",
      draft_sha256: semanticDraftSha256(value),
      diagnostics: [],
    });
    expect(semanticDraftSha256(value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects stale context, unsupported elements and unknown endpoints independently", () => {
    const value = draft();
    value.source_sha256 = "c".repeat(64);
    value.flow_paths[0].flow_element_id = "unsupported-element";
    value.flow_paths[0].to_endpoint = { kind: "zone", zone_id: "missing-zone" };
    expect(validateContamSemanticDraft(value, context()).diagnostics).toEqual([
      "semantic_draft_context_stale",
      "semantic_draft_endpoint_unknown",
      "semantic_draft_flow_element_unsupported",
    ]);
  });

  it("rejects duplicate identities, unsafe names and invalid endpoint topology", () => {
    const value = draft();
    value.zones.push({ ...value.zones[0] });
    value.flow_paths.push({
      ...value.flow_paths[0],
      from_endpoint: { kind: "outdoor", zone_id: null },
      to_endpoint: { kind: "outdoor", zone_id: null },
    });
    expect(validateContamSemanticDraft(value, context()).diagnostics).toEqual([
      "semantic_draft_flow_path_id_duplicate",
      "semantic_draft_flow_path_outdoor_to_outdoor",
      "semantic_draft_opening_duplicate",
      "semantic_draft_zone_id_duplicate",
      "semantic_draft_zone_name_duplicate",
      "semantic_draft_zone_region_duplicate",
    ]);
    const raw = structuredClone(value) as unknown as Record<string, unknown>;
    (raw.zones as Array<Record<string, unknown>>)[0].name = "bad name";
    expect(isContamSemanticDraft(raw)).toBe(false);
  });

  it("requires an explicit geometry binding when geometry context is supplied", () => {
    const value = draft();
    const geometry = {
      levels: [{ level_number: 1, zone_regions: [], openings: [], flow_path_anchors: [] }],
    } as unknown as NonNullable<ContamSemanticDraftContext["geometry"]>;
    expect(validateContamSemanticDraft(value, { ...context(), geometry }).diagnostics).toEqual([
      "semantic_draft_flow_path_geometry_mismatch",
      "semantic_draft_zone_geometry_mismatch",
    ]);
    const matching = {
      levels: [{
        level_number: 1,
        zone_regions: [{ id: "region-1", semantic_zone_id: "draft-zone-1" }],
        openings: [{ id: "opening-1" }],
        flow_path_anchors: [{
          semantic_flow_path_id: "draft-flow-1",
          opening_id: "opening-1",
          from_zone_id: "draft-zone-1",
          to_zone_id: "existing-zone-1",
          exterior_side: "none",
        }],
      }],
    } as unknown as NonNullable<ContamSemanticDraftContext["geometry"]>;
    expect(validateContamSemanticDraft(value, { ...context(), geometry: matching }).status).toBe("valid");
  });

  it("rejects unknown fields and control characters", () => {
    const value = draft() as unknown as Record<string, unknown>;
    value.unexpected = true;
    expect(isContamSemanticDraft(value)).toBe(false);
    delete value.unexpected;
    ((value.zones as Array<Record<string, unknown>>)[0]).display_name = "Office\n1";
    expect(isContamSemanticDraft(value)).toBe(false);
  });
});
