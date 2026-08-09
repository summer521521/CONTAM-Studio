// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "../../../i18n";
import { INITIAL_RESULT_DATASET_STATE, ZONE_RESULT_DATASET_SCHEMA, type ResultDatasetState, type ZoneResultDataset } from "../../../app/result-dataset-state";
import { RESULT_FIXTURE } from "../../../app/result-state.test";
import { ResultDataTable, ResultsTabs, ResultTimeSelector, type ResultsTab } from "./ResultsWorkspace";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function mount(element: React.ReactNode): Root {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
  return root;
}

function dataset(sampleCount = 150): ZoneResultDataset {
  const samples = Array.from({ length: sampleCount }, (_, index) => ({
    ...RESULT_FIXTURE.samples[0],
    index,
    sim_time_seconds: index * 60,
  }));
  const second = {
    ...RESULT_FIXTURE,
    zone_id: "00000000-0000-5000-8000-000000000002",
    zone_number: 2,
    zone_name: "Two",
    extraction_id: "extract-2",
    sample_count: 1,
    samples: [{ ...RESULT_FIXTURE.samples[0], index: 0 }],
  };
  return {
    schema: ZONE_RESULT_DATASET_SCHEMA,
    status: "ready",
    project_session_id: "session-1",
    project_source_hash: "a".repeat(64),
    revision_id: "00000000-0000-5000-8000-000000000003",
    run_id: "run-1",
    run_manifest_identity: "b".repeat(64),
    extraction_batch_id: "batch-1",
    metric_definitions: [{ key: "temperature_k", display_name: "Temperature", unit: "K" }],
    requested_zones: [
      { zone_id: RESULT_FIXTURE.zone_id, zone_number: 1, zone_name: "One" },
      { zone_id: second.zone_id, zone_number: 2, zone_name: "Two" },
    ],
    successful_zone_series: [{ ...RESULT_FIXTURE, sample_count: sampleCount, samples }, second],
    per_zone_failures: [],
    time_identity: { kind: "per_zone", shared_time_seconds: [] },
    evidence_summary: { solver_name: "ContamX", solver_version: "3.4.0.3", run_manifest_sha256: "b".repeat(64), source_unchanged: true, successful_zone_count: 2, failed_zone_count: 0 },
    created_at_unix_ms: 1,
    bounds: { zone_limit: 64, sample_limit: 250000, payload_limit_bytes: 33554432, total_samples: sampleCount + 1, truncated: false },
    dataset_fingerprint: "c".repeat(64),
  };
}

function state(selectedZoneIds: string[]): ResultDatasetState {
  const value = dataset();
  return { ...INITIAL_RESULT_DATASET_STATE, status: "ready", dataset: value, lastTrustedDataset: value, metric: "temperature_k", selectedZoneIds };
}

function TabsHarness() {
  const [tab, setTab] = useState<ResultsTab>("overview");
  return <ResultsTabs activeTab={tab} onChange={setTab} />;
}

describe("ResultsWorkspace interactions", () => {
  it("provides a roving tab stop and supports arrow, Home, and End keys", () => {
    mount(<TabsHarness />);
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(tabs[0].getAttribute("aria-controls")).toBe("results-panel-overview");
    tabs[0].focus();
    act(() => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    act(() => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tabs[3]);
    act(() => tabs[3].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    act(() => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(document.activeElement).toBe(tabs[3]);
  });

  it("clamps pagination when the selected result set shrinks", () => {
    const firstState = state([RESULT_FIXTURE.zone_id]);
    mount(<ResultDataTable state={firstState} onSelectSemantic={() => undefined} />);
    const next = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("下一页")) as HTMLButtonElement;
    act(() => next.click());
    expect(container.textContent).toContain("2/2");
    const secondZoneId = firstState.dataset!.successful_zone_series[1].zone_id;
    act(() => root.render(<ResultDataTable state={{ ...firstState, selectedZoneIds: [secondZoneId] }} onSelectSemantic={() => undefined} />));
    expect(container.textContent).toContain("1/1");
    expect(container.textContent).toContain("Two");
  });

  it("snaps arbitrary input to the nearest recorded time without interpolation", () => {
    let selected: number | null = null;
    mount(<ResultTimeSelector times={[0, 60, 120]} selectedTimeSeconds={0} onTimeChange={(time) => { selected = time; }} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "89");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(selected).toBe(60);
    expect(input.value).toBe("60");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("60 s");
  });
});
