import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScatterChart, LineChart } from "echarts/charts";
import { AriaComponent, AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { AppTheme } from "../../app/workbench-state";
import type { StudyParameter, StudyPlan, StudySampleResult } from "../../app/study-state";

use([ScatterChart, LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AxisPointerComponent, AriaComponent, CanvasRenderer]);

export interface StudyChartHandle { resetZoom: () => void; }

interface Palette { text: string; muted: string; border: string; surface: string; accent: string; secondary: string; }

const FALLBACK_PALETTE: Palette = { text: "#18212b", muted: "#586675", border: "#cfd6de", surface: "#ffffff", accent: "#1769c2", secondary: "#008b83" };

function readPalette(): Palette {
  if (typeof document === "undefined") return FALLBACK_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return { text: read("--text-primary", FALLBACK_PALETTE.text), muted: read("--text-secondary", FALLBACK_PALETTE.muted), border: read("--border", FALLBACK_PALETTE.border), surface: read("--bg-surface", FALLBACK_PALETTE.surface), accent: read("--accent", FALLBACK_PALETTE.accent), secondary: read("--accent-secondary", FALLBACK_PALETTE.secondary) };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resultStatistic(result: StudySampleResult, metric: string, zoneFilter: string | null = null, timeSeconds: number | null = null): number | null {
  const direct = finite(result.statistics[metric]);
  const directZone = typeof result.statistics.zone_id === "string" ? result.statistics.zone_id : null;
  const directTime = finite(result.statistics.time_seconds);
  if (direct !== null && (zoneFilter === null || directZone === zoneFilter) && (timeSeconds === null || directTime === timeSeconds)) return direct;
  const series = result.statistics.series;
  if (!Array.isArray(series)) return null;
  const values: number[] = [];
  for (const item of series) {
    const raw = record(item);
    const timestamp = finite(raw?.time_seconds);
    if (timestamp === null || (timeSeconds !== null && timestamp !== timeSeconds)) continue;
    const zoneId = typeof raw?.zone_id === "string" ? raw.zone_id : directZone;
    if (zoneFilter !== null && zoneId !== zoneFilter) continue;
    const value = finite(raw?.[metric]);
    if (value !== null) values.push(value);
  }
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export interface StudyRelationPoint { sample_id: string; x: number; y: number; result_hash: string; timestamp: number | null; zone_id: string | null; }

export function buildStudyRelationPoints(results: StudySampleResult[], parameterId: string, metric: string, zoneFilter: string | null = null, timeSeconds: number | null = null): StudyRelationPoint[] {
  return results
    .filter((result) => result.status === "succeeded" && typeof result.result_hash === "string" && /^[0-9a-f]{64}$/i.test(result.result_hash))
    .map((result) => {
      const x = finite(result.parameters[parameterId]);
      const y = resultStatistic(result, metric, zoneFilter, timeSeconds);
      const timestamp = finite(result.statistics.time_seconds) ?? timeSeconds;
      const candidateZone = typeof result.statistics.zone_id === "string" ? result.statistics.zone_id : zoneFilter;
      return x === null || y === null || !result.result_hash ? null : { sample_id: result.sample_id, x, y, result_hash: result.result_hash, timestamp, zone_id: candidateZone };
    })
    .filter((item): item is StudyRelationPoint => item !== null)
    .sort((left, right) => left.sample_id.localeCompare(right.sample_id));
}

export interface StudySeriesPoint { sample_id: string; time_seconds: number; value: number | null; result_hash: string; zone_id: string | null; }

export function buildStudySeriesPoints(results: StudySampleResult[], sampleIds: string[], metric: string, zoneIds: string[]): StudySeriesPoint[] {
  const selectedSamples = new Set(sampleIds);
  const selectedZones = zoneIds.length ? new Set(zoneIds) : null;
  const points: StudySeriesPoint[] = [];
  for (const result of results) {
    if (result.status !== "succeeded" || !selectedSamples.has(result.sample_id) || typeof result.result_hash !== "string" || !/^[0-9a-f]{64}$/i.test(result.result_hash)) continue;
    const statistics = result.statistics;
    const series = statistics.series;
    if (!Array.isArray(series)) continue;
    for (const item of series) {
      const raw = record(item);
      const time = finite(raw?.time_seconds);
      if (time === null) continue;
      const zoneId = typeof raw?.zone_id === "string" ? raw.zone_id : typeof statistics.zone_id === "string" ? statistics.zone_id : null;
      if (selectedZones && !selectedZones.has(zoneId ?? "")) continue;
      const value = raw && raw[metric] === null ? null : finite(raw?.[metric]);
      points.push({ sample_id: result.sample_id, time_seconds: time, value, result_hash: result.result_hash, zone_id: zoneId });
    }
  }
  return points.sort((left, right) => left.sample_id.localeCompare(right.sample_id) || left.time_seconds - right.time_seconds);
}

function axis(palette: Palette) {
  return { axisLine: { lineStyle: { color: palette.border } }, axisLabel: { color: palette.muted }, splitLine: { lineStyle: { color: palette.border, opacity: 0.45 } } };
}

export function buildStudyRelationOption(points: StudyRelationPoint[], copy: { description: string; x: string; y: string; sample: string }, palette: Palette = FALLBACK_PALETTE): EChartsCoreOption {
  const bySample = new Map(points.map((point) => [point.sample_id, point]));
  return {
    animation: false,
    backgroundColor: "transparent",
    aria: { enabled: true, description: copy.description },
    textStyle: { color: palette.text },
    grid: { left: 62, right: 28, top: 28, bottom: 48, containLabel: true },
    xAxis: { type: "value", name: copy.x, nameTextStyle: { color: palette.muted }, ...axis(palette) },
    yAxis: { type: "value", name: copy.y, nameTextStyle: { color: palette.muted }, ...axis(palette) },
    tooltip: { trigger: "item", confine: true, backgroundColor: palette.surface, borderColor: palette.border, textStyle: { color: palette.text }, formatter: (raw: unknown) => { const item = record(raw); const data = Array.isArray(item?.data) ? item.data : []; const sampleId = typeof data[2] === "string" ? data[2] : ""; const point = bySample.get(sampleId); return point ? `${copy.sample}: ${point.sample_id}<br/>${copy.x}: ${point.x}<br/>${copy.y}: ${point.y}<br/>hash: ${point.result_hash.slice(0, 12)}…` : ""; } },
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
    series: [{ type: "scatter", symbolSize: 10, itemStyle: { color: palette.accent }, data: points.map((point) => [point.x, point.y, point.sample_id]) }],
  };
}

export function buildStudyTimeSeriesOption(points: StudySeriesPoint[], copy: { description: string; time: string; value: string; sample: string }, palette: Palette = FALLBACK_PALETTE): EChartsCoreOption {
  const sampleIds = [...new Set(points.map((point) => point.sample_id))];
  return {
    animation: false,
    backgroundColor: "transparent",
    aria: { enabled: true, description: copy.description },
    textStyle: { color: palette.text },
    legend: { top: 0, textStyle: { color: palette.text }, data: sampleIds.map((id) => id.slice(0, 8)) },
    grid: { left: 64, right: 28, top: 38, bottom: 48, containLabel: true },
    xAxis: { type: "value", name: copy.time, nameTextStyle: { color: palette.muted }, ...axis(palette) },
    yAxis: { type: "value", name: copy.value, nameTextStyle: { color: palette.muted }, ...axis(palette) },
    tooltip: { trigger: "axis", confine: true, backgroundColor: palette.surface, borderColor: palette.border, textStyle: { color: palette.text }, formatter: (raw: unknown) => { const first = Array.isArray(raw) ? record(raw[0]) : record(raw); const data = Array.isArray(first?.data) ? first.data : []; const time = data[0]; const value = data[1]; return `${copy.time}: ${String(time)} s<br/>${copy.value}: ${value === null ? "—" : String(value)}`; } },
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
    series: sampleIds.map((sampleId, index) => ({ type: "line", name: sampleId.slice(0, 8), showSymbol: false, connectNulls: false, animation: false, itemStyle: { color: index % 2 ? palette.secondary : palette.accent }, data: points.filter((point) => point.sample_id === sampleId).map((point) => [point.time_seconds, point.value]) })),
  };
}

const StudyChartCanvas = forwardRef<StudyChartHandle, { option: EChartsCoreOption; ariaLabel: string }>(function StudyChartCanvas({ option, ariaLabel }, ref) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  useEffect(() => {
    if (!elementRef.current) return undefined;
    const chart = init(elementRef.current);
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(elementRef.current);
    return () => { observer.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);
  useEffect(() => { chartRef.current?.setOption(option, { notMerge: true }); }, [option]);
  useImperativeHandle(ref, () => ({ resetZoom: () => chartRef.current?.dispatchAction({ type: "dataZoom", start: 0, end: 100 }) }), []);
  return <div className="study-chart-canvas" ref={elementRef} role="img" aria-label={ariaLabel} />;
});

function metricLabel(metric: string): string { return ({ value: "value", mean: "mean", temperature_k: "temperature (K)", reference_pressure_pa: "pressure (Pa)", air_density_kg_m3: "density (kg/m³)" } as Record<string, string>)[metric] ?? metric; }

export function StudyCharts({ plan, results, theme }: { plan: StudyPlan; results: StudySampleResult[]; theme?: AppTheme }) {
  const { t } = useTranslation();
  const numericParameters = useMemo(() => plan.parameters.filter((parameter) => parameter.parameter_type !== "zone_name"), [plan.parameters]);
  const metrics = useMemo(() => {
    const names = new Set(["value", "mean", "temperature_k", "reference_pressure_pa", "air_density_kg_m3"]);
    for (const result of results) {
      if (!Array.isArray(result.statistics.series)) continue;
      for (const item of result.statistics.series) {
        const raw = record(item);
        if (!raw) continue;
        for (const key of Object.keys(raw)) if (key !== "time_seconds" && key !== "zone_id") names.add(key);
      }
    }
    return [...names].filter((item) => results.some((result) => resultStatistic(result, item) !== null));
  }, [results]);
  const [parameterId, setParameterId] = useState(numericParameters[0]?.parameter_id ?? "");
  const [metric, setMetric] = useState(metrics[0] ?? "value");
  const [sampleId, setSampleId] = useState("");
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [relationZone, setRelationZone] = useState("");
  const [relationTime, setRelationTime] = useState("");
  useEffect(() => { if (!numericParameters.some((parameter) => parameter.parameter_id === parameterId)) setParameterId(numericParameters[0]?.parameter_id ?? ""); }, [numericParameters, parameterId]);
  useEffect(() => { if (!metrics.includes(metric)) setMetric(metrics[0] ?? "value"); }, [metric, metrics]);
  const successful = useMemo(() => results.filter((result) => result.status === "succeeded" && result.result_hash), [results]);
  useEffect(() => { if (!successful.some((result) => result.sample_id === sampleId)) setSampleId(successful[0]?.sample_id ?? ""); }, [sampleId, successful]);
  const zones = useMemo(() => {
    const values = new Set<string>();
    for (const result of successful) {
      if (typeof result.statistics.zone_id === "string") values.add(result.statistics.zone_id);
      if (Array.isArray(result.statistics.series)) for (const item of result.statistics.series) {
        const zone = record(item)?.zone_id;
        if (typeof zone === "string") values.add(zone);
      }
    }
    return [...values].sort();
  }, [successful]);
  const times = useMemo(() => {
    const values = new Set<number>();
    for (const result of successful) {
      const direct = finite(result.statistics.time_seconds);
      if (direct !== null) values.add(direct);
      if (Array.isArray(result.statistics.series)) for (const item of result.statistics.series) {
        const time = finite(record(item)?.time_seconds);
        if (time !== null) values.add(time);
      }
    }
    return [...values].sort((left, right) => left - right);
  }, [successful]);
  useEffect(() => { if (relationZone && !zones.includes(relationZone)) setRelationZone(""); }, [relationZone, zones]);
  useEffect(() => { if (relationTime && !times.some((time) => String(time) === relationTime)) setRelationTime(""); }, [relationTime, times]);
  const relationPoints = useMemo(() => buildStudyRelationPoints(results, parameterId, metric, relationZone || null, relationTime ? Number(relationTime) : null), [metric, parameterId, relationTime, relationZone, results]);
  const seriesPoints = useMemo(() => buildStudySeriesPoints(results, sampleId ? [sampleId] : [], metric, zoneIds), [metric, results, sampleId, zoneIds]);
  const relationRef = useRef<StudyChartHandle>(null);
  const seriesRef = useRef<StudyChartHandle>(null);
  const relationOption = useMemo(() => buildStudyRelationOption(relationPoints, { description: t("studies.visual.relationDescription"), x: t("studies.visual.parameterAxis"), y: metricLabel(metric), sample: t("studies.sample") }, readPalette()), [metric, relationPoints, t, theme]);
  const seriesOption = useMemo(() => buildStudyTimeSeriesOption(seriesPoints, { description: t("studies.visual.seriesDescription"), time: t("studies.visual.timeAxis"), value: metricLabel(metric), sample: t("studies.sample") }, readPalette()), [metric, seriesPoints, t, theme]);
  const selectedParameter = numericParameters.find((parameter) => parameter.parameter_id === parameterId);
  return <section className="study-visualization" aria-labelledby="study-visualization-title">
    <div className="study-visualization-heading"><div><strong id="study-visualization-title">{t("studies.visual.title")}</strong><span>{t("studies.visual.subtitle")}</span></div><div className="study-visualization-hashes"><code>{plan.baseline_project_sha256.slice(0, 12)}…</code><code>{plan.study_hash.slice(0, 12)}…</code></div></div>
    <div className="study-visualization-controls"><label><span>{t("studies.visual.parameter")}</span><select value={parameterId} onChange={(event) => setParameterId(event.target.value)} disabled={!numericParameters.length}>{numericParameters.length ? numericParameters.map((parameter: StudyParameter) => <option value={parameter.parameter_id} key={parameter.parameter_id}>{parameter.name}</option>) : <option value="">{t("studies.visual.noParameter")}</option>}</select></label><label><span>{t("studies.visual.metric")}</span><select value={metric} onChange={(event) => setMetric(event.target.value)}>{metrics.length ? metrics.map((item) => <option value={item} key={item}>{metricLabel(item)}</option>) : <option value="value">{t("studies.visual.noMetric")}</option>}</select></label><label><span>{t("studies.visual.relationZone")}</span><select value={relationZone} onChange={(event) => setRelationZone(event.target.value)}><option value="">{t("studies.visual.allZones")}</option>{zones.map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select></label><label><span>{t("studies.visual.timePoint")}</span><select value={relationTime} onChange={(event) => setRelationTime(event.target.value)}><option value="">{t("studies.visual.allTimes")}</option>{times.map((time) => <option value={String(time)} key={time}>{time} s</option>)}</select></label><label><span>{t("studies.visual.sample")}</span><select value={sampleId} onChange={(event) => setSampleId(event.target.value)} disabled={!successful.length}>{successful.length ? successful.map((result) => <option value={result.sample_id} key={result.sample_id}>{result.sample_id.slice(0, 8)}</option>) : <option value="">{t("studies.visual.noSample")}</option>}</select></label></div>
    <div className="study-chart-grid"><article className="study-chart-card"><div className="study-chart-heading"><strong>{t("studies.visual.relation")}</strong><button className="panel-icon-button" type="button" onClick={() => relationRef.current?.resetZoom()} title={t("studies.visual.resetZoom")} aria-label={t("studies.visual.resetZoom")}><RotateCcw size={14} /></button></div>{relationPoints.length ? <StudyChartCanvas ref={relationRef} option={relationOption} ariaLabel={t("studies.visual.relationDescription")} /> : <p className="study-chart-empty">{t("studies.visual.emptyRelation")}</p>}</article><article className="study-chart-card"><div className="study-chart-heading"><strong>{t("studies.visual.series")}</strong><button className="panel-icon-button" type="button" onClick={() => seriesRef.current?.resetZoom()} title={t("studies.visual.resetZoom")} aria-label={t("studies.visual.resetZoom")}><RotateCcw size={14} /></button></div>{zones.length ? <div className="study-zone-filters" aria-label={t("studies.visual.zoneFilter")}>{zones.map((zone) => <label key={zone}><input type="checkbox" checked={!zoneIds.length || zoneIds.includes(zone)} onChange={(event) => setZoneIds((current) => event.target.checked ? [...new Set([...current, zone])] : current.filter((item) => item !== zone))} />{zone}</label>)}</div> : null}{seriesPoints.length ? <StudyChartCanvas ref={seriesRef} option={seriesOption} ariaLabel={t("studies.visual.seriesDescription")} /> : <p className="study-chart-empty">{t("studies.visual.emptySeries")}</p>}</article></div>
    {selectedParameter ? <p className="study-chart-note">{t("studies.visual.evidenceNote", { parameter: selectedParameter.name })}</p> : null}
  </section>;
}
