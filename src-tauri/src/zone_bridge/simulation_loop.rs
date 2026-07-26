use super::*;
use serde::de::Error as DeError;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

const SIMULATION_PLAN_TTL_MS: u128 = 15 * 60 * 1_000;
const MAX_SIMULATION_GOAL_CHARS: usize = 2_000;
const MAX_SIMULATION_TRACE_RECORDS: usize = 32;
static SIMULATION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SimulationPlanStatus {
    NeedsInput,
    Ready,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum SimulationAction {
    ReplaceZoneVolume {
        zone_id: String,
        new_volume_token: String,
    },
    RunCurrentRevision,
    AnalyzeActiveZoneResult {
        zone_id: String,
    },
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum SimulationActionWire {
    ReplaceZoneVolume {
        zone_id: String,
        new_volume_token: String,
    },
    RunCurrentRevision,
    AnalyzeActiveZoneResult {
        zone_id: String,
    },
}

impl<'de> Deserialize<'de> for SimulationAction {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let object = value
            .as_object()
            .ok_or_else(|| D::Error::custom("simulation action must be an object"))?;
        let allowed = match object.get("action").and_then(Value::as_str) {
            Some("replace_zone_volume") => ["action", "zone_id", "new_volume_token"].as_slice(),
            Some("run_current_revision") => ["action"].as_slice(),
            Some("analyze_active_zone_result") => ["action", "zone_id"].as_slice(),
            _ => return Err(D::Error::custom("simulation action is unsupported")),
        };
        if object.len() != allowed.len()
            || object.keys().any(|key| !allowed.contains(&key.as_str()))
        {
            return Err(D::Error::custom(
                "simulation action contained an unknown field",
            ));
        }
        match serde_json::from_value::<SimulationActionWire>(value)
            .map_err(|_| D::Error::custom("simulation action is invalid"))?
        {
            SimulationActionWire::ReplaceZoneVolume {
                zone_id,
                new_volume_token,
            } => {
                if Uuid::parse_str(&zone_id).is_err()
                    || !new_volume_token.parse::<f64>().is_ok_and(|value| {
                        value.is_finite() && value > 0.0 && value <= 1_000_000_000.0
                    })
                {
                    return Err(D::Error::custom("simulation action has an invalid value"));
                }
                Ok(Self::ReplaceZoneVolume {
                    zone_id,
                    new_volume_token,
                })
            }
            SimulationActionWire::RunCurrentRevision => Ok(Self::RunCurrentRevision),
            SimulationActionWire::AnalyzeActiveZoneResult { zone_id }
                if Uuid::parse_str(&zone_id).is_ok() =>
            {
                Ok(Self::AnalyzeActiveZoneResult { zone_id })
            }
            SimulationActionWire::AnalyzeActiveZoneResult { .. } => {
                Err(D::Error::custom("simulation action has an invalid Zone"))
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SimulationDiffView {
    zone_id: String,
    zone_name: String,
    field: &'static str,
    old_token: String,
    new_token: String,
    old_value: f64,
    new_value: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SimulationPlanView {
    schema_version: &'static str,
    plan_id: String,
    status: SimulationPlanStatus,
    goal: String,
    project_session_id: Option<String>,
    revision_id: Option<String>,
    revision_number: Option<u64>,
    zone_id: Option<String>,
    zone_name: Option<String>,
    assumptions: Vec<String>,
    questions: Vec<String>,
    actions: Vec<SimulationAction>,
    risks: Vec<String>,
    context_fingerprint: String,
    volume_diff: Option<SimulationDiffView>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SimulationTimelineStepView {
    step: &'static str,
    status: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SafeAiAnalysisView {
    result_type: &'static str,
    zone_id: String,
    zone_name: String,
    run_id: String,
    extraction_id: String,
    sample_count: u64,
    temperature_k_min: f64,
    temperature_k_max: f64,
    reference_pressure_pa_min: f64,
    reference_pressure_pa_max: f64,
    limitations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SimulationExecutionView {
    trace_id: String,
    plan_hash: String,
    approval_hash: String,
    revision_id: Option<String>,
    revision_number: Option<u64>,
    run_id: Option<String>,
    extraction_id: Option<String>,
    previous_trusted_result_available: bool,
    safe_ai_analysis: Option<SafeAiAnalysisView>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopSimulationPlanResponse {
    request_id: String,
    plan: Option<SimulationPlanView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopSimulationExecutionResponse {
    request_id: String,
    status: &'static str,
    timeline: Vec<SimulationTimelineStepView>,
    execution: Option<SimulationExecutionView>,
    project_session_id: Option<String>,
    project: Option<ProjectInspection>,
    target_zone_id: Option<String>,
    draft: Option<DraftSummary>,
    run: Option<ContamXRunSummaryView>,
    result: Option<ZoneAirStateResultView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug)]
struct SimulationContext {
    project_session_id: String,
    revision_id: String,
    revision_number: u64,
    source_sha256: String,
    zones: Vec<ZoneRecord>,
    selected_zone_id: Option<String>,
}

#[derive(Clone, Debug)]
struct SimulationPlanRecord {
    view: SimulationPlanView,
    patch_id: String,
    project_session_id: String,
    revision_id: String,
    source_sha256: String,
    zone_id: String,
    expires_at_unix_ms: u128,
    consumed: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct SimulationTraceRecord {
    trace_id: String,
    plan_hash: String,
    approval_hash: String,
    revision_id: Option<String>,
    run_id: Option<String>,
    extraction_id: Option<String>,
    succeeded: bool,
}

#[derive(Default)]
struct SimulationLoopState {
    plans: BTreeMap<String, SimulationPlanRecord>,
    active_execution_plan_id: Option<String>,
    traces: Vec<SimulationTraceRecord>,
}

#[derive(Default)]
pub struct SimulationLoopStore {
    state: Mutex<SimulationLoopState>,
}

#[derive(Clone, Debug)]
struct ClaimedActionBundle {
    plan: SimulationPlanRecord,
    trace_id: String,
    approval_hash: String,
    expires_at_unix_ms: u128,
}

impl SimulationLoopStore {
    pub(crate) fn close_activity_active(&self) -> bool {
        self.state
            .lock()
            .expect("simulation loop mutex poisoned")
            .active_execution_plan_id
            .is_some()
    }

    fn store_plan(&self, record: SimulationPlanRecord) {
        let mut state = self.state.lock().expect("simulation loop mutex poisoned");
        state.plans.retain(|_, candidate| !candidate.consumed);
        if state.plans.len() >= MAX_SIMULATION_TRACE_RECORDS {
            if let Some(oldest) = state.plans.keys().next().cloned() {
                state.plans.remove(&oldest);
            }
        }
        state.plans.insert(record.view.plan_id.clone(), record);
    }

    fn claim(
        &self,
        plan_id: &str,
        context: &SimulationContext,
        now_unix_ms: u128,
    ) -> Result<ClaimedActionBundle, ReaderDiagnostic> {
        let mut state = self.state.lock().expect("simulation loop mutex poisoned");
        if state.active_execution_plan_id.is_some() {
            return Err(simulation_diagnostic(
                "simulation_execution_busy",
                "Another approved simulation is already executing.",
            ));
        }
        let plan = state.plans.get_mut(plan_id).ok_or_else(|| {
            simulation_diagnostic(
                "simulation_plan_missing",
                "The simulation plan is unavailable. Generate a new plan.",
            )
        })?;
        if plan.consumed {
            return Err(simulation_diagnostic(
                "simulation_approval_replayed",
                "The simulation approval was already used.",
            ));
        }
        if now_unix_ms >= plan.expires_at_unix_ms {
            return Err(simulation_diagnostic(
                "simulation_plan_expired",
                "The simulation plan expired. Generate it again before approving.",
            ));
        }
        if plan.project_session_id != context.project_session_id
            || plan.revision_id != context.revision_id
            || plan.source_sha256 != context.source_sha256
            || plan.zone_id != context.selected_zone_id.clone().unwrap_or_default()
        {
            return Err(simulation_diagnostic(
                "simulation_context_stale",
                "The project, revision, or Zone changed after planning.",
            ));
        }
        plan.consumed = true;
        let expires_at_unix_ms = now_unix_ms + SIMULATION_PLAN_TTL_MS;
        let approval_hash = action_bundle_hash(plan, now_unix_ms, expires_at_unix_ms)?;
        let claimed = ClaimedActionBundle {
            plan: plan.clone(),
            trace_id: fresh_id("trace"),
            approval_hash,
            expires_at_unix_ms,
        };
        state.active_execution_plan_id = Some(plan_id.to_owned());
        Ok(claimed)
    }

    fn finish(&self, plan_id: &str, trace: SimulationTraceRecord) {
        let mut state = self.state.lock().expect("simulation loop mutex poisoned");
        if state.active_execution_plan_id.as_deref() == Some(plan_id) {
            state.active_execution_plan_id = None;
        }
        state.traces.push(trace);
        if state.traces.len() > MAX_SIMULATION_TRACE_RECORDS {
            state.traces.remove(0);
        }
    }
}

fn simulation_diagnostic(code: &str, message: &str) -> ReaderDiagnostic {
    host_diagnostic(code, message, BTreeMap::new())
}

fn simulation_plan_failure(
    request_id: String,
    error: ReaderDiagnostic,
) -> DesktopSimulationPlanResponse {
    DesktopSimulationPlanResponse {
        request_id,
        plan: None,
        error: Some(error),
    }
}

fn base_timeline() -> Vec<SimulationTimelineStepView> {
    [
        "validate_context",
        "create_draft_revision",
        "run_contamx",
        "read_result",
        "analyze_result",
    ]
    .into_iter()
    .map(|step| SimulationTimelineStepView {
        step,
        status: "pending",
    })
    .collect()
}

fn mark_timeline(timeline: &mut [SimulationTimelineStepView], index: usize, status: &'static str) {
    if let Some(step) = timeline.get_mut(index) {
        step.status = status;
    }
}

fn sha256_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher
        .update(value.as_bytes())
        .expect("bounded simulation hash input");
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect()
}

fn fresh_id(kind: &str) -> String {
    let sequence = SIMULATION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let identity = format!("simulation|{kind}|{}|{sequence}", unix_time_ms());
    Uuid::new_v5(&ZONE_UUID_NAMESPACE, identity.as_bytes()).to_string()
}

fn safe_goal(goal: &str) -> Result<String, ReaderDiagnostic> {
    let trimmed = goal.trim();
    if trimmed.is_empty()
        || trimmed.chars().count() > MAX_SIMULATION_GOAL_CHARS
        || trimmed.chars().any(|character| character.is_control())
    {
        return Err(simulation_diagnostic(
            "simulation_goal_invalid",
            "The simulation goal is invalid.",
        ));
    }
    Ok(trimmed.to_owned())
}

fn goal_contains_forbidden_input(goal: &str) -> bool {
    let lower = goal.to_ascii_lowercase();
    [
        "shell",
        "powershell",
        "cmd.exe",
        "bash",
        "raw_prj",
        "prj正文",
        "file://",
        "file:/",
        "../",
        "./",
        "\\\\",
        "原始prj",
        "文件路径",
        "命令行",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
        || goal.contains(['/', '\\', '{', '}'])
        || lower.contains(":\\")
        || lower.contains(":/")
        || [
            "replace_zone_volume",
            "run_current_revision",
            "analyze_active_zone_result",
            "\"actions\"",
            "\"action\"",
        ]
        .iter()
        .any(|needle| lower.contains(needle))
}

fn goal_requests_unsupported_edit(goal: &str) -> bool {
    let lower = goal.to_ascii_lowercase();
    [
        "all zones",
        "multiple zones",
        "multi-zone",
        "parameter sweep",
        "完整prj",
        "全部区域",
        "多个区域",
        "多参数",
        "批量",
        "附件",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn goal_mentions_run(goal: &str) -> bool {
    let lower = goal.to_ascii_lowercase();
    ["run", "simulate", "仿真", "运行", "求解"]
        .iter()
        .any(|needle| lower.contains(needle))
}

fn goal_mentions_analysis(goal: &str) -> bool {
    let lower = goal.to_ascii_lowercase();
    ["analy", "temperature", "pressure", "分析", "温度", "压力"]
        .iter()
        .any(|needle| lower.contains(needle))
}

fn goal_mentions_current_zone(goal: &str) -> bool {
    let lower = goal.to_ascii_lowercase();
    lower.contains("current zone")
        || lower.contains("selected zone")
        || goal.contains("当前Zone")
        || goal.contains("该区域")
}

fn goal_mentions_zone(goal: &str, zone_name: &str) -> bool {
    if zone_name.is_empty() {
        return false;
    }
    if zone_name.is_ascii() {
        let expected = zone_name.to_ascii_lowercase();
        goal.split(|character: char| !character.is_ascii_alphanumeric())
            .any(|token| token.eq_ignore_ascii_case(&expected))
    } else {
        goal.contains(zone_name)
    }
}

fn parse_volume_token(goal: &str) -> Option<String> {
    let bytes = goal.as_bytes();
    for start in 0..bytes.len() {
        if !bytes[start].is_ascii_digit() && bytes[start] != b'.' {
            continue;
        }
        let mut end = start;
        while end < bytes.len()
            && (bytes[end].is_ascii_digit()
                || matches!(bytes[end], b'.' | b'+' | b'-' | b'e' | b'E'))
        {
            end += 1;
        }
        let token = goal.get(start..end)?;
        let value = token.parse::<f64>().ok()?;
        let unit_tail = goal.get(end..)?.trim_start();
        if value.is_finite()
            && value > 0.0
            && value <= 1_000_000_000.0
            && (unit_tail.starts_with("m3")
                || unit_tail.starts_with("m³")
                || unit_tail.starts_with("立方米"))
        {
            return Some(token.to_owned());
        }
    }
    None
}

fn current_context(
    project_store: &DesktopProjectSessionStore,
    project_session_id: &str,
    revision_id: &str,
    selected_zone_id: &str,
) -> Result<SimulationContext, ReaderDiagnostic> {
    let state = project_store
        .state
        .lock()
        .expect("desktop session mutex poisoned");
    let active = state.active_project.as_ref().ok_or_else(|| {
        simulation_diagnostic(
            "simulation_context_missing",
            "Open a supported project before creating a simulation plan.",
        )
    })?;
    if active.project_session_id != project_session_id
        || active.active_revision().revision_id != revision_id
    {
        return Err(simulation_diagnostic(
            "simulation_context_stale",
            "The project revision changed after the simulation request.",
        ));
    }
    let selected_zone_id = (!selected_zone_id.is_empty()
        && active.zone_by_id(selected_zone_id).is_some())
    .then(|| selected_zone_id.to_owned());
    Ok(SimulationContext {
        project_session_id: active.project_session_id.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        revision_number: active.active_revision().revision_number,
        source_sha256: active.source_sha256.clone(),
        zones: active.zones.clone(),
        selected_zone_id,
    })
}

fn context_fingerprint(context: &SimulationContext, goal: &str) -> String {
    let payload = json!({
        "schema_version": "simulation_plan.v1",
        "project_session_id": context.project_session_id,
        "revision_id": context.revision_id,
        "revision_number": context.revision_number,
        "source_sha256": context.source_sha256,
        "selected_zone_id": context.selected_zone_id,
        "goal": goal,
    });
    sha256_text(&serde_json::to_string(&payload).expect("fixed simulation context payload"))
}

fn make_plan_view(context: &SimulationContext, goal: String) -> SimulationPlanView {
    let plan_id = fresh_id("plan");
    let fingerprint = context_fingerprint(context, &goal);
    if goal_contains_forbidden_input(&goal) {
        return SimulationPlanView {
            schema_version: "simulation_plan.v1",
            plan_id,
            status: SimulationPlanStatus::Unsupported,
            goal,
            project_session_id: Some(context.project_session_id.clone()),
            revision_id: Some(context.revision_id.clone()),
            revision_number: Some(context.revision_number),
            zone_id: None,
            zone_name: None,
            assumptions: Vec::new(),
            questions: Vec::new(),
            actions: Vec::new(),
            risks: vec![
                "The request included a forbidden path, shell, or raw-project instruction.".into(),
            ],
            context_fingerprint: fingerprint,
            volume_diff: None,
        };
    }
    if goal_requests_unsupported_edit(&goal) {
        return SimulationPlanView {
            schema_version: "simulation_plan.v1",
            plan_id,
            status: SimulationPlanStatus::Unsupported,
            goal,
            project_session_id: Some(context.project_session_id.clone()),
            revision_id: Some(context.revision_id.clone()),
            revision_number: Some(context.revision_number),
            zone_id: None,
            zone_name: None,
            assumptions: Vec::new(),
            questions: Vec::new(),
            actions: Vec::new(),
            risks: vec!["Only one Zone volume_m3 change is supported in this version.".into()],
            context_fingerprint: fingerprint,
            volume_diff: None,
        };
    }
    let matched_zones: Vec<&ZoneRecord> = context
        .zones
        .iter()
        .filter(|zone| goal_mentions_zone(&goal, &zone.name))
        .collect();
    let selected = if matched_zones.len() == 1 {
        Some(matched_zones[0])
    } else if matched_zones.is_empty() && goal_mentions_current_zone(&goal) {
        context
            .selected_zone_id
            .as_ref()
            .and_then(|zone_id| context.zones.iter().find(|zone| zone.zone_id == *zone_id))
    } else {
        None
    };
    let token = parse_volume_token(&goal);
    let mut questions = Vec::new();
    if matched_zones.len() > 1 {
        questions.push("请选择唯一的Zone；当前目标匹配多个Zone。".into());
    } else if selected.is_none() {
        questions.push("请说明要修改哪个Zone，或明确使用当前Zone。".into());
    }
    if token.is_none() {
        questions.push("请提供一个有限且大于零的目标体积，例如650 m³。".into());
    }
    if !goal_mentions_run(&goal) || !goal_mentions_analysis(&goal) {
        questions.push("请确认此方案是否需要运行ContamX并分析可信的温度和压力结果。".into());
    }
    if !questions.is_empty() {
        return SimulationPlanView {
            schema_version: "simulation_plan.v1",
            plan_id,
            status: SimulationPlanStatus::NeedsInput,
            goal,
            project_session_id: Some(context.project_session_id.clone()),
            revision_id: Some(context.revision_id.clone()),
            revision_number: Some(context.revision_number),
            zone_id: selected.map(|zone| zone.zone_id.clone()),
            zone_name: selected.map(|zone| zone.name.clone()),
            assumptions: Vec::new(),
            questions,
            actions: Vec::new(),
            risks: vec!["No draft, solver, result extraction, or remote AI action will start until the plan is ready and approved.".into()],
            context_fingerprint: fingerprint,
            volume_diff: None,
        };
    }
    let zone = selected.expect("ready plan has selected Zone");
    let token = token.expect("ready plan has volume token");
    SimulationPlanView {
        schema_version: "simulation_plan.v1",
        plan_id,
        status: SimulationPlanStatus::Ready,
        goal,
        project_session_id: Some(context.project_session_id.clone()),
        revision_id: Some(context.revision_id.clone()),
        revision_number: Some(context.revision_number),
        zone_id: Some(zone.zone_id.clone()),
        zone_name: Some(zone.name.clone()),
        assumptions: vec![
            "Only the selected Zone volume_m3 token can change.".into(),
            "The source PRJ remains unchanged; approval creates an immutable draft Revision.".into(),
            "ContamX and SimRead remain official external tools with existing identity checks.".into(),
        ],
        questions: Vec::new(),
        actions: vec![
            SimulationAction::ReplaceZoneVolume {
                zone_id: zone.zone_id.clone(),
                new_volume_token: token,
            },
            SimulationAction::RunCurrentRevision,
            SimulationAction::AnalyzeActiveZoneResult {
                zone_id: zone.zone_id.clone(),
            },
        ],
        risks: vec![
            "The plan expires after 15 minutes and can be approved once.".into(),
            "A failed run retains the created draft and does not fabricate a result.".into(),
            "Only a bounded result summary is prepared for AI analysis; no path, PRJ text, or complete result series is disclosed.".into(),
        ],
        context_fingerprint: fingerprint,
        volume_diff: None,
    }
}

fn ready_plan_action(plan: &SimulationPlanView) -> Result<(&str, &str), ReaderDiagnostic> {
    if plan.status != SimulationPlanStatus::Ready || plan.actions.len() != 3 {
        return Err(simulation_diagnostic(
            "simulation_plan_invalid",
            "The simulation plan is not executable.",
        ));
    }
    match (&plan.actions[0], &plan.actions[1], &plan.actions[2]) {
        (
            SimulationAction::ReplaceZoneVolume {
                zone_id,
                new_volume_token,
            },
            SimulationAction::RunCurrentRevision,
            SimulationAction::AnalyzeActiveZoneResult {
                zone_id: analysis_zone_id,
            },
        ) if zone_id == analysis_zone_id
            && new_volume_token
                .parse::<f64>()
                .is_ok_and(|value| value.is_finite() && value > 0.0) =>
        {
            Ok((zone_id, new_volume_token))
        }
        _ => Err(simulation_diagnostic(
            "simulation_action_invalid",
            "The simulation plan contained an unsupported or duplicate action.",
        )),
    }
}

fn action_bundle_hash(
    plan: &SimulationPlanRecord,
    approved_at_unix_ms: u128,
    expires_at_unix_ms: u128,
) -> Result<String, ReaderDiagnostic> {
    let payload = json!({
        "schema_version": "action_bundle.v1",
        "project_session_id": plan.project_session_id,
        "revision_id": plan.revision_id,
        "zone_id": plan.zone_id,
        "simulation_plan": plan.view,
        "plan_hash": plan.view.context_fingerprint,
        "approved_at_unix_ms": approved_at_unix_ms,
        "expires_at_unix_ms": expires_at_unix_ms,
    });
    serde_json::to_string(&payload)
        .map(|serialized| sha256_text(&serialized))
        .map_err(|_| {
            simulation_diagnostic(
                "simulation_bundle_invalid",
                "The action bundle was invalid.",
            )
        })
}

fn bundle_is_current(bundle: &ClaimedActionBundle) -> Result<(), ReaderDiagnostic> {
    if unix_time_ms() >= bundle.expires_at_unix_ms {
        Err(simulation_diagnostic(
            "simulation_approval_expired",
            "The approved action bundle expired before execution completed.",
        ))
    } else {
        Ok(())
    }
}

fn safe_analysis(result: &ZoneAirStateResultView) -> Result<SafeAiAnalysisView, ReaderDiagnostic> {
    if result.samples.is_empty() || result.sample_count as usize != result.samples.len() {
        return Err(simulation_diagnostic(
            "simulation_result_invalid",
            "The trusted Zone result summary was invalid.",
        ));
    }
    let mut temperature_k_min = f64::INFINITY;
    let mut temperature_k_max = f64::NEG_INFINITY;
    let mut reference_pressure_pa_min = f64::INFINITY;
    let mut reference_pressure_pa_max = f64::NEG_INFINITY;
    for sample in &result.samples {
        if !sample.temperature_k.is_finite() || !sample.reference_pressure_pa.is_finite() {
            return Err(simulation_diagnostic(
                "simulation_result_invalid",
                "The trusted Zone result contained a non-finite value.",
            ));
        }
        temperature_k_min = temperature_k_min.min(sample.temperature_k);
        temperature_k_max = temperature_k_max.max(sample.temperature_k);
        reference_pressure_pa_min = reference_pressure_pa_min.min(sample.reference_pressure_pa);
        reference_pressure_pa_max = reference_pressure_pa_max.max(sample.reference_pressure_pa);
    }
    Ok(SafeAiAnalysisView {
        result_type: "zone_air_state",
        zone_id: result.zone_id.clone(),
        zone_name: result.zone_name.clone(),
        run_id: result.run_id.clone(),
        extraction_id: result.extraction_id.clone(),
        sample_count: result.sample_count,
        temperature_k_min,
        temperature_k_max,
        reference_pressure_pa_min,
        reference_pressure_pa_max,
        limitations: vec![
            "Only deterministic statistics are included; the complete result series is excluded.".into(),
            "This prepared analysis input does not claim a remote AI response or a scientific conclusion.".into(),
        ],
    })
}

fn execution_view(
    bundle: &ClaimedActionBundle,
    revision_id: Option<String>,
    revision_number: Option<u64>,
    run_id: Option<String>,
    extraction_id: Option<String>,
    previous_trusted_result_available: bool,
    safe_ai_analysis: Option<SafeAiAnalysisView>,
) -> SimulationExecutionView {
    SimulationExecutionView {
        trace_id: bundle.trace_id.clone(),
        plan_hash: bundle.plan.view.context_fingerprint.clone(),
        approval_hash: bundle.approval_hash.clone(),
        revision_id,
        revision_number,
        run_id,
        extraction_id,
        previous_trusted_result_available,
        safe_ai_analysis,
    }
}

#[allow(clippy::too_many_arguments)]
fn finish_failure(
    store: &SimulationLoopStore,
    bundle: &ClaimedActionBundle,
    request_id: String,
    timeline: Vec<SimulationTimelineStepView>,
    execution: SimulationExecutionView,
    project_session_id: Option<String>,
    project: Option<ProjectInspection>,
    target_zone_id: Option<String>,
    draft: Option<DraftSummary>,
    error: ReaderDiagnostic,
) -> DesktopSimulationExecutionResponse {
    store.finish(
        &bundle.plan.view.plan_id,
        SimulationTraceRecord {
            trace_id: bundle.trace_id.clone(),
            plan_hash: bundle.plan.view.context_fingerprint.clone(),
            approval_hash: bundle.approval_hash.clone(),
            revision_id: execution.revision_id.clone(),
            run_id: execution.run_id.clone(),
            extraction_id: execution.extraction_id.clone(),
            succeeded: false,
        },
    );
    DesktopSimulationExecutionResponse {
        request_id,
        status: "failed",
        timeline,
        execution: Some(execution),
        project_session_id,
        project,
        target_zone_id,
        draft,
        run: None,
        result: None,
        error: Some(error),
    }
}

#[tauri::command]
pub async fn prepare_simulation_plan(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    selected_zone_id: String,
    goal: String,
) -> DesktopSimulationPlanResponse {
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
    {
        return simulation_plan_failure(
            request_id,
            simulation_diagnostic(
                "simulation_request_invalid",
                "The simulation request is invalid.",
            ),
        );
    }
    let goal = match safe_goal(&goal) {
        Ok(value) => value,
        Err(error) => return simulation_plan_failure(request_id, error),
    };
    let project_store = app.state::<DesktopProjectSessionStore>();
    let context = match current_context(
        project_store.inner(),
        &project_session_id,
        &revision_id,
        &selected_zone_id,
    ) {
        Ok(value) => value,
        Err(error) => return simulation_plan_failure(request_id, error),
    };
    let mut view = make_plan_view(&context, goal);
    if view.status == SimulationPlanStatus::Ready {
        let (zone_id, token) = match ready_plan_action(&view) {
            Ok((zone_id, token)) => (zone_id.to_owned(), token.to_owned()),
            Err(error) => return simulation_plan_failure(request_id, error),
        };
        let patch_response = plan_zone_volume_patch(
            app.clone(),
            fresh_id("patch-plan"),
            project_session_id.clone(),
            zone_id.clone(),
            token,
        )
        .await;
        let Some(review) = patch_response.review else {
            return simulation_plan_failure(
                request_id,
                patch_response.error.unwrap_or_else(|| {
                    simulation_diagnostic(
                        "simulation_patch_plan_invalid",
                        "The shared Zone volume Diff could not be created.",
                    )
                }),
            );
        };
        if review.project_session_id != project_session_id || review.zone_id != zone_id {
            return simulation_plan_failure(
                request_id,
                simulation_diagnostic(
                    "simulation_patch_plan_invalid",
                    "The shared Zone volume Diff did not match the simulation context.",
                ),
            );
        }
        let patch_id = review.patch_id.clone();
        view.volume_diff = Some(SimulationDiffView {
            zone_id: review.zone_id,
            zone_name: review.zone_name,
            field: "volume_m3",
            old_token: review.old_token,
            new_token: review.new_token,
            old_value: review.old_value,
            new_value: review.new_value,
        });
        app.state::<SimulationLoopStore>()
            .store_plan(SimulationPlanRecord {
                view: view.clone(),
                patch_id,
                project_session_id: context.project_session_id,
                revision_id: context.revision_id,
                source_sha256: context.source_sha256,
                zone_id,
                expires_at_unix_ms: unix_time_ms() + SIMULATION_PLAN_TTL_MS,
                consumed: false,
            });
    }
    DesktopSimulationPlanResponse {
        request_id,
        plan: Some(view),
        error: None,
    }
}

#[tauri::command]
pub async fn approve_and_run_simulation_plan(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    plan_id: String,
    zone_id: String,
) -> DesktopSimulationExecutionResponse {
    let mut timeline = base_timeline();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&plan_id).is_err()
        || Uuid::parse_str(&zone_id).is_err()
    {
        return DesktopSimulationExecutionResponse {
            request_id,
            status: "failed",
            timeline,
            execution: None,
            project_session_id: None,
            project: None,
            target_zone_id: None,
            draft: None,
            run: None,
            result: None,
            error: Some(simulation_diagnostic(
                "simulation_request_invalid",
                "The simulation approval request is invalid.",
            )),
        };
    }
    let project_store = app.state::<DesktopProjectSessionStore>();
    let plan_snapshot = {
        let state = project_store
            .state
            .lock()
            .expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.as_ref() else {
            return DesktopSimulationExecutionResponse {
                request_id,
                status: "failed",
                timeline,
                execution: None,
                project_session_id: None,
                project: None,
                target_zone_id: None,
                draft: None,
                run: None,
                result: None,
                error: Some(simulation_diagnostic(
                    "simulation_context_missing",
                    "Open a supported project before approving a simulation.",
                )),
            };
        };
        let selected_zone_id = active.zone_by_id(&zone_id).map(|zone| zone.zone_id.clone());
        if selected_zone_id.is_none() {
            return DesktopSimulationExecutionResponse {
                request_id,
                status: "failed",
                timeline,
                execution: None,
                project_session_id: None,
                project: None,
                target_zone_id: None,
                draft: None,
                run: None,
                result: None,
                error: Some(simulation_diagnostic(
                    "simulation_context_stale",
                    "The selected Zone changed after planning.",
                )),
            };
        }
        SimulationContext {
            project_session_id: active.project_session_id.clone(),
            revision_id: active.active_revision().revision_id.clone(),
            revision_number: active.active_revision().revision_number,
            source_sha256: active.source_sha256.clone(),
            zones: active.zones.clone(),
            selected_zone_id,
        }
    };
    if plan_snapshot.project_session_id != project_session_id {
        return DesktopSimulationExecutionResponse {
            request_id,
            status: "failed",
            timeline,
            execution: None,
            project_session_id: None,
            project: None,
            target_zone_id: None,
            draft: None,
            run: None,
            result: None,
            error: Some(simulation_diagnostic(
                "simulation_context_stale",
                "The project session changed after planning.",
            )),
        };
    }
    let plan_store = app.state::<SimulationLoopStore>();
    let bundle = match plan_store.claim(&plan_id, &plan_snapshot, unix_time_ms()) {
        Ok(value) => value,
        Err(error) => {
            return DesktopSimulationExecutionResponse {
                request_id,
                status: "failed",
                timeline,
                execution: None,
                project_session_id: None,
                project: None,
                target_zone_id: None,
                draft: None,
                run: None,
                result: None,
                error: Some(error),
            }
        }
    };
    mark_timeline(&mut timeline, 0, "completed");
    let (zone_id, _) = match ready_plan_action(&bundle.plan.view) {
        Ok(value) => value,
        Err(error) => {
            mark_timeline(&mut timeline, 0, "failed");
            return finish_failure(
                plan_store.inner(),
                &bundle,
                request_id,
                timeline,
                execution_view(&bundle, None, None, None, None, false, None),
                None,
                None,
                None,
                None,
                error,
            );
        }
    };
    if let Err(error) = bundle_is_current(&bundle) {
        mark_timeline(&mut timeline, 1, "failed");
        return finish_failure(
            plan_store.inner(),
            &bundle,
            request_id,
            timeline,
            execution_view(&bundle, None, None, None, None, false, None),
            None,
            None,
            None,
            None,
            error,
        );
    }
    let apply = apply_zone_volume_patch_to_draft(
        app.clone(),
        fresh_id("apply"),
        project_session_id.clone(),
        bundle.plan.patch_id.clone(),
    )
    .await;
    let applied = match (
        apply.project,
        apply.target_zone_id,
        apply.draft,
        apply.error,
    ) {
        (Some(project), Some(target_zone_id), Some(draft), None) => {
            (project, target_zone_id, draft)
        }
        (_, _, _, error) => {
            mark_timeline(&mut timeline, 1, "failed");
            return finish_failure(
                plan_store.inner(),
                &bundle,
                request_id,
                timeline,
                execution_view(
                    &bundle,
                    None,
                    None,
                    None,
                    None,
                    project_store.has_last_trusted_result(),
                    None,
                ),
                None,
                None,
                None,
                None,
                error.unwrap_or_else(|| {
                    simulation_diagnostic(
                        "simulation_patch_apply_invalid",
                        "The shared draft Revision response was invalid.",
                    )
                }),
            );
        }
    };
    mark_timeline(&mut timeline, 1, "completed");
    let (project, target_zone_id, draft) = applied;
    let revision_id = draft.revision_id.clone();
    let revision_number = draft.revision_number;
    if let Err(error) = bundle_is_current(&bundle) {
        mark_timeline(&mut timeline, 2, "failed");
        return finish_failure(
            plan_store.inner(),
            &bundle,
            request_id,
            timeline,
            execution_view(
                &bundle,
                Some(revision_id),
                Some(revision_number),
                None,
                None,
                project_store.has_last_trusted_result(),
                None,
            ),
            Some(project_session_id),
            Some(project),
            Some(target_zone_id),
            Some(draft),
            error,
        );
    }
    let run =
        run_active_contam_project(app.clone(), fresh_id("run"), project_session_id.clone()).await;
    let summary = match (run.summary, run.error) {
        (Some(summary), None) => summary,
        (_, error) => {
            mark_timeline(&mut timeline, 2, "failed");
            return finish_failure(
                plan_store.inner(),
                &bundle,
                request_id,
                timeline,
                execution_view(
                    &bundle,
                    Some(revision_id),
                    Some(revision_number),
                    None,
                    None,
                    project_store.has_last_trusted_result(),
                    None,
                ),
                Some(project_session_id),
                Some(project),
                Some(target_zone_id),
                Some(draft),
                error.unwrap_or_else(|| {
                    simulation_diagnostic(
                        "simulation_run_invalid",
                        "The ContamX run response was invalid.",
                    )
                }),
            );
        }
    };
    mark_timeline(&mut timeline, 2, "completed");
    if let Err(error) = bundle_is_current(&bundle) {
        mark_timeline(&mut timeline, 3, "failed");
        return finish_failure(
            plan_store.inner(),
            &bundle,
            request_id,
            timeline,
            execution_view(
                &bundle,
                Some(revision_id),
                Some(revision_number),
                Some(summary.run_id.clone()),
                None,
                project_store.has_last_trusted_result(),
                None,
            ),
            Some(project_session_id),
            Some(project),
            Some(target_zone_id),
            Some(draft),
            error,
        );
    }
    let extracted = extract_active_run_zone_air_state(
        app.clone(),
        fresh_id("extract"),
        project_session_id.clone(),
        zone_id.to_owned(),
    )
    .await;
    let result = match (extracted.result, extracted.error) {
        (Some(result), None) => result,
        (_, error) => {
            mark_timeline(&mut timeline, 3, "failed");
            return finish_failure(
                plan_store.inner(),
                &bundle,
                request_id,
                timeline,
                execution_view(
                    &bundle,
                    Some(revision_id),
                    Some(revision_number),
                    Some(summary.run_id.clone()),
                    None,
                    project_store.has_last_trusted_result(),
                    None,
                ),
                Some(project_session_id),
                Some(project),
                Some(target_zone_id),
                Some(draft),
                error.unwrap_or_else(|| {
                    simulation_diagnostic(
                        "simulation_result_invalid",
                        "The Zone result response was invalid.",
                    )
                }),
            );
        }
    };
    mark_timeline(&mut timeline, 3, "completed");
    let analysis = match safe_analysis(&result) {
        Ok(value) => value,
        Err(error) => {
            mark_timeline(&mut timeline, 4, "failed");
            return finish_failure(
                plan_store.inner(),
                &bundle,
                request_id,
                timeline,
                execution_view(
                    &bundle,
                    Some(revision_id),
                    Some(revision_number),
                    Some(summary.run_id.clone()),
                    Some(result.extraction_id.clone()),
                    project_store.has_last_trusted_result(),
                    None,
                ),
                Some(project_session_id),
                Some(project),
                Some(target_zone_id),
                Some(draft),
                error,
            );
        }
    };
    mark_timeline(&mut timeline, 4, "completed");
    let execution = execution_view(
        &bundle,
        Some(revision_id.clone()),
        Some(revision_number),
        Some(summary.run_id.clone()),
        Some(result.extraction_id.clone()),
        project_store.has_last_trusted_result(),
        Some(analysis),
    );
    plan_store.finish(
        &bundle.plan.view.plan_id,
        SimulationTraceRecord {
            trace_id: bundle.trace_id.clone(),
            plan_hash: bundle.plan.view.context_fingerprint.clone(),
            approval_hash: bundle.approval_hash.clone(),
            revision_id: Some(revision_id),
            run_id: Some(summary.run_id.clone()),
            extraction_id: Some(result.extraction_id.clone()),
            succeeded: true,
        },
    );
    DesktopSimulationExecutionResponse {
        request_id,
        status: "succeeded",
        timeline,
        execution: Some(execution),
        project_session_id: Some(project_session_id),
        project: Some(project),
        target_zone_id: Some(target_zone_id),
        draft: Some(draft),
        run: Some(summary),
        result: Some(result),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> SimulationContext {
        SimulationContext {
            project_session_id: "session-1".into(),
            revision_id: "00000000-0000-5000-8000-000000000001".into(),
            revision_number: 0,
            source_sha256: "A".repeat(64),
            zones: vec![ZoneRecord {
                zone_id: "00000000-0000-5000-8000-000000000002".into(),
                contam_number: 1,
                name: "One".into(),
                flags: 0,
                level_number: 1,
                relative_height: 0.0,
                volume_m3: 600.0,
                source_line_number: 42,
            }],
            selected_zone_id: Some("00000000-0000-5000-8000-000000000002".into()),
        }
    }

    #[test]
    fn plan_requires_missing_fields_and_closes_unknown_requests() {
        let missing = make_plan_view(&context(), "Run and analyze the current Zone.".into());
        assert_eq!(missing.status, SimulationPlanStatus::NeedsInput);
        assert!(!missing.questions.is_empty());
        let unsupported = make_plan_view(
            &context(),
            "Use PowerShell and edit raw_PRJ for all zones.".into(),
        );
        assert_eq!(unsupported.status, SimulationPlanStatus::Unsupported);
        assert!(unsupported.actions.is_empty());
    }

    #[test]
    fn ready_plan_is_closed_to_the_three_allowed_actions() {
        let plan = make_plan_view(
            &context(),
            "Set One volume to 650 m3, run and analyze temperature and pressure.".into(),
        );
        assert_eq!(plan.status, SimulationPlanStatus::Ready);
        assert_eq!(plan.actions.len(), 3);
        assert_eq!(
            ready_plan_action(&plan),
            Ok(("00000000-0000-5000-8000-000000000002", "650"))
        );
        assert!(
            serde_json::from_str::<SimulationAction>(r#"{"action":"shell","command":"x"}"#)
                .is_err()
        );
        assert!(serde_json::from_str::<SimulationAction>(
            r#"{"action":"run_current_revision","path":"C:\\x"}"#
        )
        .is_err());
        assert!(serde_json::from_str::<SimulationAction>(
            r#"{"action":"replace_zone_volume","zone_id":"00000000-0000-5000-8000-000000000003","new_volume_token":"NaN"}"#
        )
        .is_err());
        assert_eq!(
            make_plan_view(
                &context(),
                "Set One volume to 650 m3, run and analyze /nested/path.".into(),
            )
            .status,
            SimulationPlanStatus::Unsupported
        );
    }

    #[test]
    fn approval_is_one_time_expiring_and_context_bound() {
        let context = context();
        let mut view = make_plan_view(
            &context,
            "Set One volume to 650 m3, run and analyze temperature and pressure.".into(),
        );
        let zone_id = view.zone_id.clone().unwrap();
        view.volume_diff = Some(SimulationDiffView {
            zone_id: zone_id.clone(),
            zone_name: "One".into(),
            field: "volume_m3",
            old_token: "600".into(),
            new_token: "650".into(),
            old_value: 600.0,
            new_value: 650.0,
        });
        let store = SimulationLoopStore::default();
        let record = SimulationPlanRecord {
            patch_id: fresh_id("patch"),
            project_session_id: context.project_session_id.clone(),
            revision_id: context.revision_id.clone(),
            source_sha256: context.source_sha256.clone(),
            zone_id,
            expires_at_unix_ms: 200,
            consumed: false,
            view: view.clone(),
        };
        store.store_plan(record);
        let claim_context = SimulationContext {
            selected_zone_id: view.zone_id.clone(),
            ..context.clone()
        };
        let bundle = store.claim(&view.plan_id, &claim_context, 100).unwrap();
        assert_eq!(bundle.approval_hash.len(), 64);
        store.finish(
            &view.plan_id,
            SimulationTraceRecord {
                trace_id: bundle.trace_id,
                plan_hash: bundle.plan.view.context_fingerprint,
                approval_hash: bundle.approval_hash,
                revision_id: None,
                run_id: None,
                extraction_id: None,
                succeeded: false,
            },
        );
        assert_eq!(
            store
                .claim(&view.plan_id, &claim_context, 101)
                .unwrap_err()
                .code,
            "simulation_approval_replayed"
        );
        let mut changed = claim_context.clone();
        changed.revision_id = "00000000-0000-5000-8000-000000000099".into();
        let mut second = view.clone();
        second.plan_id = fresh_id("plan");
        store.store_plan(SimulationPlanRecord {
            view: second.clone(),
            patch_id: fresh_id("patch"),
            project_session_id: claim_context.project_session_id.clone(),
            revision_id: claim_context.revision_id.clone(),
            source_sha256: claim_context.source_sha256.clone(),
            zone_id: claim_context.selected_zone_id.clone().unwrap(),
            expires_at_unix_ms: 200,
            consumed: false,
        });
        assert_eq!(
            store
                .claim(&second.plan_id, &changed, 101)
                .unwrap_err()
                .code,
            "simulation_context_stale"
        );
    }

    #[test]
    fn safe_analysis_rejects_non_finite_samples_without_fabricating_output() {
        let result = ZoneAirStateResultView {
            schema_version: RESULT_SCHEMA_VERSION.into(),
            result_type: "zone_air_state".into(),
            run_id: "run-1".into(),
            extraction_id: "extract-1".into(),
            zone_id: "zone-1".into(),
            zone_number: 1,
            zone_name: "One".into(),
            source_line_number: 1,
            unit_system: "SI".into(),
            sample_count: 1,
            samples: vec![ZoneAirStateSampleView {
                index: 0,
                day_of_year: 1,
                day_type: None,
                sim_time_seconds: 0.0,
                temperature_k: f64::NAN,
                reference_pressure_pa: 0.0,
                air_density_kg_m3: 1.2,
            }],
            day_type_source: "not_available".into(),
            time_contract: "from_first_sample".into(),
        };
        assert_eq!(
            safe_analysis(&result).unwrap_err().code,
            "simulation_result_invalid"
        );
    }
}
