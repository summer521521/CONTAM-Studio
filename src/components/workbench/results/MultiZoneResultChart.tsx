import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LineChart } from "echarts/charts";
import { AriaComponent, AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { ResultMetricKey, ZoneResultDataset } from "../../../app/result-dataset-state";
import type { AppTheme } from "../../../app/workbench-state";

use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AxisPointerComponent, AriaComponent, CanvasRenderer]);

const METRIC_UNITS: Record<ResultMetricKey, string> = {
  temperature_k: "K",
  reference_pressure_pa: "Pa",
  air_density_kg_m3: "kg/m³",
};

export function calculateYAxisRange(
  values: Iterable<number | null | undefined>,
  metric: ResultMetricKey,
): { min: number; max: number } | undefined {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  return finishYAxisRange(low, high, metric);
}

function finishYAxisRange(
  low: number,
  high: number,
  metric: ResultMetricKey,
): { min: number; max: number } {
  const minimumPadding: Record<ResultMetricKey, number> = {
    temperature_k: 0.01,
    reference_pressure_pa: 0.1,
    air_density_kg_m3: 0.001,
  };
  const padding = low === high
    ? Math.max(Math.abs(low) * 0.001, minimumPadding[metric])
    : Math.max((high - low) * 0.08, minimumPadding[metric]);
  return { min: low - padding, max: high + padding };
}

export function buildMultiZoneChartOption(
  dataset: ZoneResultDataset,
  metric: ResultMetricKey,
  zoneIds: readonly string[],
  copy: { time: string; value: string; description: string; resultIdentity: string },
): EChartsCoreOption {
  const selected = new Set(zoneIds);
  const series: Array<{
    id: string;
    name: string;
    type: "line";
    showSymbol: false;
    connectNulls: false;
    animation: false;
    data: Array<[number, number | null]>;
  }> = [];
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const item of dataset.successful_zone_series) {
    if (!selected.has(item.zone_id)) continue;
    const data = item.samples.map((sample) => {
      const value = sample[metric];
      if (typeof value === "number" && Number.isFinite(value)) {
        if (value < low) low = value;
        if (value > high) high = value;
      }
      return [sample.sim_time_seconds, value] as [number, number | null];
    });
    series.push({
      id: item.zone_id,
      name: `${item.zone_name} · #${item.zone_number}`,
      type: "line",
      showSymbol: false,
      connectNulls: false,
      animation: false,
      data,
    });
  }
  const yRange = Number.isFinite(low) && Number.isFinite(high)
    ? finishYAxisRange(low, high, metric)
    : undefined;
  return {
    animation: false,
    aria: { enabled: true, description: copy.description },
    legend: { type: "scroll", top: 0 },
    grid: { left: 72, right: 24, top: 48, bottom: 64 },
    xAxis: { type: "value", name: `${copy.time} (s)`, nameLocation: "middle", nameGap: 30 },
    yAxis: {
      type: "value",
      name: METRIC_UNITS[metric],
      scale: true,
      axisLabel: { show: true },
      ...(yRange ?? {}),
    },
    axisPointer: { show: true, snap: true },
    dataZoom: [
      { type: "inside", filterMode: "none" },
      { type: "slider", height: 18, bottom: 14 },
    ],
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (parameters: unknown) => {
        const rows = Array.isArray(parameters) ? parameters : [];
        const time = rows[0] && typeof rows[0] === "object" ? (rows[0] as { axisValue?: unknown }).axisValue : null;
        const lines = [`${copy.time}: ${typeof time === "number" ? time : "—"} s`];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const item = row as { seriesName?: string; value?: unknown };
          const value = Array.isArray(item.value) ? item.value[1] : null;
          lines.push(`${item.seriesName ?? "—"}: ${typeof value === "number" ? value : "—"} ${METRIC_UNITS[metric]}`);
        }
        lines.push(`${copy.resultIdentity}: ${dataset.dataset_fingerprint.slice(0, 12)}`);
        return lines.join("<br/>");
      },
    },
    series,
  };
}

export function MultiZoneResultChart({
  dataset,
  metric,
  zoneIds,
  theme,
  onTimeSelect,
  onZoneSelect,
}: {
  dataset: ZoneResultDataset;
  metric: ResultMetricKey;
  zoneIds: string[];
  theme: AppTheme;
  onTimeSelect: (time: number) => void;
  onZoneSelect: (zoneId: string) => void;
}) {
  const { t } = useTranslation();
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const onTimeSelectRef = useRef(onTimeSelect);
  const onZoneSelectRef = useRef(onZoneSelect);
  const option = useMemo(() => buildMultiZoneChartOption(dataset, metric, zoneIds, {
    time: t("resultsWorkspace.time"),
    value: t("resultsWorkspace.value"),
    description: t("resultsWorkspace.chartDescription"),
    resultIdentity: t("resultsWorkspace.resultIdentity"),
  }), [dataset, metric, t, zoneIds]);

  useEffect(() => {
    onTimeSelectRef.current = onTimeSelect;
    onZoneSelectRef.current = onZoneSelect;
  }, [onTimeSelect, onZoneSelect]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    const chart = init(element, theme === "dark" ? "dark" : undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option, { notMerge: true });
    const handlePointer = (params: unknown) => {
      const value = params && typeof params === "object" ? (params as { axesInfo?: Array<{ value?: unknown }> }).axesInfo?.[0]?.value : null;
      if (typeof value === "number" && Number.isFinite(value)) onTimeSelectRef.current(value);
    };
    const handleSeriesClick = (params: unknown) => {
      const seriesId = params && typeof params === "object" ? (params as { seriesId?: unknown }).seriesId : null;
      if (typeof seriesId === "string" && seriesId) onZoneSelectRef.current(seriesId);
    };
    chart.on("updateAxisPointer", handlePointer);
    chart.on("click", handleSeriesClick);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.off("updateAxisPointer", handlePointer);
      chart.off("click", handleSeriesClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={elementRef} className="multi-zone-result-chart" role="img" aria-label={t("resultsWorkspace.chartDescription")} />;
}
