import { useCallback, useRef, type Dispatch, type MutableRefObject } from "react";
import { runActiveContamProject } from "../desktop-api";
import { runResponseIssue, type RunAction, type RunState } from "../run-state";
import type { ProjectInspection } from "../project-state";
import type { CommandAvailability } from "../command-availability";
import type { AiAction } from "../ai-state";

interface RunControllerOptions {
  availability: Pick<CommandAvailability, "runProject">;
  project: ProjectInspection | null;
  projectSessionId: string | null;
  runState: RunState;
  mounted: MutableRefObject<boolean>;
  dispatchRun: Dispatch<RunAction>;
  dispatchAi: Dispatch<AiAction>;
  onRunStarted: () => void;
}

export function useRunController({
  availability,
  project,
  projectSessionId,
  runState,
  mounted,
  dispatchRun,
  dispatchAi,
  onRunStarted,
}: RunControllerOptions) {
  const runSequence = useRef(0);

  const runProject = useCallback(async () => {
    if (!availability.runProject || !projectSessionId || !project) return;
    const sequence = ++runSequence.current;
    const requestId = crypto.randomUUID();
    dispatchRun({ type: "run_started", sequence, requestId, projectSessionId });
    onRunStarted();
    try {
      const response = await runActiveContamProject(requestId, projectSessionId);
      if (!mounted.current || sequence !== runSequence.current) return;
      const issue = runResponseIssue(response, requestId);
      if (issue || !response.summary || response.project_session_id !== projectSessionId) {
        dispatchRun({
          type: "run_failed",
          sequence,
          requestId,
          issue: issue ?? { code: "run_response_contract_invalid", message: "Run response did not match the active project.", source_line_number: null, context: {} },
        });
        return;
      }
      dispatchRun({ type: "run_succeeded", sequence, requestId, projectSessionId, summary: response.summary });
      dispatchAi({ type: "context_changed" });
    } catch {
      if (!mounted.current || sequence !== runSequence.current) return;
      dispatchRun({ type: "run_failed", sequence, requestId, issue: { code: "desktop_bridge_invoke_failed", message: "Desktop run bridge invocation failed", source_line_number: null, context: {} } });
    }
  }, [availability.runProject, dispatchAi, dispatchRun, mounted, onRunStarted, project, projectSessionId]);

  return { runProject, activeRunId: runState.summary?.run_id ?? null, runSequence };
}
