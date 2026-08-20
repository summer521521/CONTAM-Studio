// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import type { GeometryFlowPathAnchor, GeometryOpening, GeometryWall } from "../../../app/geometry/geometry-model";
import type { WallAirflowBoundary, WallFlowPathOption } from "../../../app/geometry/geometry-wall-airflow";
import { WallFlowPathEditor } from "./WallFlowPathEditor";

let container: HTMLDivElement;
let root: Root;

const opening: GeometryOpening = {
  id: "window-1", wall_id: "wall-1", kind: "window", offset: 1_000, width: 1_200,
  swing: "none", adjacent_zone_ids: ["zone-1"],
};
const wall: GeometryWall = {
  id: "wall-1", start_vertex_id: "v1", end_vertex_id: "v2", kind: "exterior",
  thickness: 200, source_icon_id: null,
};
const boundary: WallAirflowBoundary = { status: "ready", kind: "exterior", opening, wall, zoneIds: ["zone-1"] };
const option: WallFlowPathOption = {
  id: "flow-1", label: "Envelope leakage", boundaryKind: "exterior",
  fromZoneId: "zone-1", toZoneId: null, exteriorSide: "to",
};
const anchor: GeometryFlowPathAnchor = {
  id: "anchor-1", opening_id: "window-1", semantic_flow_path_id: "flow-1",
  from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to",
};

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function mount(overrides: Partial<React.ComponentProps<typeof WallFlowPathEditor>> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: React.ComponentProps<typeof WallFlowPathEditor> = {
    opening,
    wall,
    boundary,
    anchor: null,
    audit: null,
    options: [option],
    selectedFlowPathId: null,
    zoneLabels: new Map([["zone-1", "Office"]]),
    flowPathLabels: new Map([["flow-1", "Envelope leakage"]]),
    onSelectFlowPath: vi.fn(),
    onBind: vi.fn(),
    onUnbind: vi.fn(),
    ...overrides,
  };
  act(() => root.render(<WallFlowPathEditor {...props} />));
  return props;
}

describe("WallFlowPathEditor", () => {
  it("shows a contextual endpoint choice and requires explicit binding", () => {
    const props = mount({ selectedFlowPathId: "flow-1" });
    expect(container.textContent).toContain("Office ↔");
    expect(container.textContent).toContain("Envelope leakage");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("绑定"));
    expect(button?.disabled).toBe(false);
    act(() => button?.click());
    expect(props.onBind).toHaveBeenCalledOnce();
  });

  it("shows verified direction for a saved anchor and exposes unbind", () => {
    const props = mount({
      anchor,
      audit: { status: "verified", boundaryKind: "exterior", diagnosticCode: null },
      options: [],
    });
    expect(container.textContent).toContain("语义端点已核验");
    expect(container.textContent).toContain("Office → 室外环境");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("解除绑定"));
    act(() => button?.click());
    expect(props.onUnbind).toHaveBeenCalledOnce();
  });
});
