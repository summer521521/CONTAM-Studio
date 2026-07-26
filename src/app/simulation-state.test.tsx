import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CodexAssistantPanel } from "../components/workbench/CodexAssistantPanel";
import {
  INITIAL_AI_STATE,
} from "./ai-state";
import {
  INITIAL_SIMULATION_STATE,
  isSafeSimulationExecutionResponse,
  isSafeSimulationPlan,
  simulationReducer,
  type DesktopSimulationExecutionResponse,
  type SimulationPlanView,
} from "./simulation-state";

const sessionId = "00000000-0000-5000-8000-000000000010";
const revisionId = "00000000-0000-5000-8000-000000000011";
const zoneId = "00000000-0000-5000-8000-000000000012";
const planId = "00000000-0000-5000-8000-000000000013";

function plan(status: SimulationPlanView["status"] = "ready"): SimulationPlanView {
  return {
    schema_version: "simulation_plan.v1",
    plan_id: planId,
    status,
    goal: "Set One volume to 650 m3, run and analyze temperature and pressure.",
    project_session_id: sessionId,
    revision_id: revisionId,
    revision_number: 0,
    zone_id: status === "ready" ? zoneId : null,
    zone_name: status === "ready" ? "One" : null,
    assumptions: status === "ready" ? ["One field only."] : [],
    questions: status === "needs_input" ? ["Which Zone should change?"] : [],
    actions: status === "ready" ? [
      { action: "replace_zone_volume", zone_id: zoneId, new_volume_token: "650" },
      { action: "run_current_revision" },
      { action: "analyze_active_zone_result", zone_id: zoneId },
    ] : [],
    risks: ["The plan expires after 15 minutes."],
    context_fingerprint: "a".repeat(64),
    volume_diff: status === "ready" ? {
      zone_id: zoneId,
      zone_name: "One",
      field: "volume_m3",
      old_token: "600",
      new_token: "650",
      old_value: 600,
      new_value: 650,
    } : null,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("approved simulation state", () => {
  it("accepts only the closed ready, needs-input, and unsupported plan shapes", () => {
    expect(isSafeSimulationPlan(plan("ready"))).toBe(true);
    expect(isSafeSimulationPlan(plan("needs_input"))).toBe(true);
    expect(isSafeSimulationPlan(plan("unsupported"))).toBe(true);
    expect(isSafeSimulationPlan({ ...plan(), extra: "blocked" })).toBe(false);
    expect(isSafeSimulationPlan({ ...plan(), actions: [{ action: "shell", command: "cmd.exe" }] })).toBe(false);
    expect(isSafeSimulationPlan({ ...plan(), actions: [{ action: "run_current_revision", path: "C:\\secret" }] })).toBe(false);
    expect(isSafeSimulationPlan({ ...plan(), volume_diff: { ...plan().volume_diff!, new_value: Number.NaN } })).toBe(false);
  });

  it("drops a late plan or execution response after cancellation or context change", () => {
    const planning = simulationReducer({ ...INITIAL_SIMULATION_STATE, goal: "goal" }, { type: "plan_started", requestId: "request-1" });
    const cancelled = simulationReducer(planning, { type: "plan_cancelled" });
    expect(simulationReducer(cancelled, { type: "plan_received", requestId: "request-1", plan: plan() })).toEqual(cancelled);

    const ready = simulationReducer(planning, { type: "plan_received", requestId: "request-1", plan: plan() });
    const executing = simulationReducer(ready, { type: "execution_started", requestId: "request-2" });
    const changed = simulationReducer(executing, { type: "context_changed" });
    const late = simulationReducer(changed, { type: "execution_finished", requestId: "request-2", response: failedExecution("request-2") });
    expect(late).toEqual(changed);
  });

  it("rejects a completed response that exposes an unvalidated run or result", () => {
    const response = failedExecution("request-3");
    expect(isSafeSimulationExecutionResponse(response, "request-3")).toBe(true);
    const polluted = { ...response, error: { ...response.error!, context: { path: "C:\\secret" } } };
    expect(isSafeSimulationExecutionResponse(polluted, "request-3")).toBe(false);
  });

  it("renders bilingual mode switching and exactly three approval commands", async () => {
    const simulationState = { ...INITIAL_SIMULATION_STATE, mode: "simulation_plan" as const, status: "ready" as const, plan: plan() };
    const markup = renderToStaticMarkup(
      <CodexAssistantPanel
        state={INITIAL_AI_STATE}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
        simulationState={simulationState}
      />,
    );
    expect(markup).toContain("Analysis");
    expect(markup).toContain("Simulation plan");
    expect(markup).toContain("Back");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Approve and Run");
    expect(markup).not.toContain("Prepare plan");
    expect(markup).not.toContain("source_path");
    expect(markup).not.toContain("C:\\");

    await i18n.changeLanguage("zh-CN");
    const chinese = renderToStaticMarkup(
      <CodexAssistantPanel
        state={INITIAL_AI_STATE}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
        simulationState={simulationState}
      />,
    );
    expect(chinese).toContain("分析");
    expect(chinese).toContain("仿真方案");
    expect(chinese).toContain("批准并运行");
    await i18n.changeLanguage("en");
  });
});

function failedExecution(requestId: string): DesktopSimulationExecutionResponse {
  return {
    request_id: requestId,
    status: "failed",
    timeline: [
      { step: "validate_context", status: "completed" },
      { step: "create_draft_revision", status: "failed" },
      { step: "run_contamx", status: "pending" },
      { step: "read_result", status: "pending" },
      { step: "analyze_result", status: "pending" },
    ],
    execution: null,
    project_session_id: null,
    project: null,
    target_zone_id: null,
    draft: null,
    run: null,
    result: null,
    error: { code: "simulation_patch_apply_invalid", message: "The shared draft failed.", source_line_number: null, context: {} },
  };
}
