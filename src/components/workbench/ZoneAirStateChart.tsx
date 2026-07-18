import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LineChart } from "echarts/charts";
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { AppTheme } from "../../app/workbench-state";
import type { ZoneAirStateResult } from "../../app/result-state";
import { formatElapsedSeconds } from "../../app/zone-air-state-analysis";

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AxisPointerComponent,
  AriaComponent,
  CanvasRenderer,
]);

export interface ZoneAirStateChartHandle {
  resetZoom: () => void;
}

interface ZoneAirStateChartProps {
  result: ZoneAirStateResult;
  theme: AppTheme;
}

export interface ChartPalette {
  text: string;
  muted: string;
  border: string;
  surface: string;
  temperature: string;
  pressure: string;
  density: string;
}

interface ChartCopy {
  description: string;
  time: string;
  sample: string;
  elapsed: string;
  temperature: string;
  pressure: string;
  density: string;
  language: "zh-CN" | "en";
}

export interface ChartController {
  setOption: (option: EChartsCoreOption) => void;
  resetZoom: () => void;
  dispose: () => void;
}

interface ChartLike {
  setOption: (option: EChartsCoreOption, options?: { notMerge?: boolean }) => void;
  resize: () => void;
  dispatchAction: (payload: { type: string; start?: number; end?: number }) => void;
  dispose: () => void;
}

interface ObserverLike {
  observe: (target: Element) => void;
  disconnect: () => void;
}

const DEFAULT_PALETTE: ChartPalette = {
  text: "#18212b",
  muted: "#586675",
  border: "#cfd6de",
  surface: "#ffffff",
  temperature: "#1769c2",
  pressure: "#008b83",
  density: "#b96700",
};

function readPalette(): ChartPalette {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const variable = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    text: variable("--text-primary", DEFAULT_PALETTE.text),
    muted: variable("--text-secondary", DEFAULT_PALETTE.muted),
    border: variable("--border", DEFAULT_PALETTE.border),
    surface: variable("--bg-surface", DEFAULT_PALETTE.surface),
    temperature: variable("--chart-temperature", DEFAULT_PALETTE.temperature),
    pressure: variable("--chart-pressure", DEFAULT_PALETTE.pressure),
    density: variable("--chart-density", DEFAULT_PALETTE.density),
  };
}

function tooltipTime(parameters: unknown): number | null {
  const first = Array.isArray(parameters) ? parameters[0] : parameters;
  if (!first || typeof first !== "object") return null;
  const value = (first as { axisValue?: unknown }).axisValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildZoneAirStateChartOption(
  result: ZoneAirStateResult,
  copy: ChartCopy,
  palette: ChartPalette = DEFAULT_PALETTE,
): EChartsCoreOption {
  const samplesByTime = new Map(result.samples.map((sample) => [sample.sim_time_seconds, sample]));
  const commonAxis = {
    type: "value" as const,
    min: result.samples[0]?.sim_time_seconds ?? 0,
    max: result.samples.at(-1)?.sim_time_seconds ?? 0,
    name: `${copy.time} (s)`,
    nameLocation: "middle" as const,
    nameGap: 27,
    nameTextStyle: { color: palette.muted },
    axisLine: { lineStyle: { color: palette.border } },
    axisTick: { show: true, lineStyle: { color: palette.border } },
    axisLabel: { show: true, color: palette.muted },
    splitLine: { lineStyle: { color: palette.border, opacity: 0.45 } },
  };
  return {
    animation: false,
    backgroundColor: "transparent",
    color: [palette.temperature, palette.pressure, palette.density],
    textStyle: { color: palette.text },
    aria: { enabled: true, description: copy.description },
    legend: {
      top: 0,
      textStyle: { color: palette.text },
      data: [copy.temperature, copy.pressure, copy.density],
    },
    grid: [
      { left: 76, right: 28, top: 48, height: "18%", containLabel: false },
      { left: 76, right: 28, top: "38%", height: "18%", containLabel: false },
      { left: 76, right: 28, top: "68%", height: "18%", containLabel: false },
    ],
    axisPointer: { link: [{ xAxisIndex: [0, 1, 2] }] },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: palette.surface,
      borderColor: palette.border,
      textStyle: { color: palette.text },
      formatter: (parameters: unknown) => {
        const time = tooltipTime(parameters);
        const sample = time === null ? undefined : samplesByTime.get(time);
        if (!sample) return "";
        return [
          `${copy.sample}: ${sample.index}`,
          `${copy.elapsed}: ${sample.sim_time_seconds} s (${formatElapsedSeconds(sample.sim_time_seconds, copy.language)})`,
          `${copy.temperature}: ${sample.temperature_k} K`,
          `${copy.pressure}: ${sample.reference_pressure_pa} Pa`,
          `${copy.density}: ${sample.air_density_kg_m3} kg/m³`,
        ].join("<br/>");
      },
    },
    xAxis: [
      { ...commonAxis, gridIndex: 0 },
      { ...commonAxis, gridIndex: 1 },
      { ...commonAxis, gridIndex: 2 },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, name: "K", nameTextStyle: { color: palette.muted }, axisLabel: { color: palette.muted }, splitLine: { lineStyle: { color: palette.border, opacity: 0.45 } } },
      { type: "value", gridIndex: 1, name: "Pa", nameTextStyle: { color: palette.muted }, axisLabel: { color: palette.muted }, splitLine: { lineStyle: { color: palette.border, opacity: 0.45 } } },
      { type: "value", gridIndex: 2, name: "kg/m³", nameTextStyle: { color: palette.muted }, axisLabel: { color: palette.muted }, splitLine: { lineStyle: { color: palette.border, opacity: 0.45 } } },
    ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: [0, 1, 2],
        filterMode: "none",
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseWheel: false,
        moveOnMouseMove: true,
      },
    ],
    series: [
      {
        name: copy.temperature,
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: result.samples.map((sample) => [sample.sim_time_seconds, sample.temperature_k]),
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        animation: false,
      },
      {
        name: copy.pressure,
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: result.samples.map((sample) => [sample.sim_time_seconds, sample.reference_pressure_pa]),
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        animation: false,
      },
      {
        name: copy.density,
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: result.samples.map((sample) => [sample.sim_time_seconds, sample.air_density_kg_m3]),
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        animation: false,
      },
    ],
  };
}

export function attachZoneAirStateChart(
  element: HTMLElement,
  createChart: (target: HTMLElement) => ChartLike,
  createObserver: (callback: () => void) => ObserverLike,
): ChartController {
  const chart = createChart(element);
  const observer = createObserver(() => chart.resize());
  observer.observe(element);
  return {
    setOption: (option) => chart.setOption(option, { notMerge: true }),
    resetZoom: () => chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 }),
    dispose: () => {
      observer.disconnect();
      chart.dispose();
    },
  };
}

export const ZoneAirStateChart = forwardRef<ZoneAirStateChartHandle, ZoneAirStateChartProps>(
  function ZoneAirStateChart({ result, theme }, ref) {
    const { t, i18n } = useTranslation();
    const elementRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<ChartController | null>(null);
    const language = i18n.language === "en" ? "en" : "zh-CN";
    const option = useMemo(
      () => buildZoneAirStateChartOption(result, {
        description: t("results.chart.description"),
        time: t("results.timeLabel"),
        sample: t("results.chart.sample"),
        elapsed: t("results.chart.elapsed"),
        temperature: t("results.chart.temperature"),
        pressure: t("results.chart.pressure"),
        density: t("results.chart.density"),
        language,
      }, readPalette()),
      [i18n.language, language, result, t, theme],
    );

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      controllerRef.current = attachZoneAirStateChart(
        element,
        (target) => init(target) as ECharts,
        (callback) => {
          const observer = new ResizeObserver(callback);
          return observer;
        },
      );
      return () => {
        controllerRef.current?.dispose();
        controllerRef.current = null;
      };
    }, []);

    useEffect(() => {
      controllerRef.current?.setOption(option);
    }, [option]);

    useImperativeHandle(ref, () => ({
      resetZoom: () => controllerRef.current?.resetZoom(),
    }), []);

    return <div className="zone-air-state-chart" ref={elementRef} role="img" aria-label={t("results.chart.description")} />;
  },
);
