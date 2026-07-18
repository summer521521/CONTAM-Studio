import { describe, expect, it, vi } from "vitest";
import { RESULT_FIXTURE } from "../../app/result-state.test";
import {
  attachZoneAirStateChart,
  buildZoneAirStateChartOption,
} from "./ZoneAirStateChart";

const copy = {
  description: "Verified air state",
  time: "Elapsed time",
  sample: "Sample",
  elapsed: "Elapsed",
  temperature: "Temperature",
  pressure: "Pressure",
  density: "Density",
  language: "en" as const,
};

describe("Zone air-state ECharts contract", () => {
  it("keeps all real samples in three unsmoothed synchronized series", () => {
    const before = JSON.stringify(RESULT_FIXTURE.samples);
    const option = buildZoneAirStateChartOption(RESULT_FIXTURE, copy);
    const series = option.series as Array<Record<string, unknown>>;
    expect(series).toHaveLength(3);
    expect(series.map((item) => item.data)).toEqual([
      [[0, 293.15]],
      [[0, -1.4222]],
      [[0, 1.2041]],
    ]);
    for (const item of series) {
      expect(item.smooth).toBe(false);
      expect(item.connectNulls).toBe(false);
      expect(item.animation).toBe(false);
      expect(item).not.toHaveProperty("sampling");
    }
    const zoom = option.dataZoom as Array<{ type: string; xAxisIndex: number[]; zoomOnMouseWheel: boolean }>;
    expect(zoom).toHaveLength(1);
    expect(zoom[0]).toMatchObject({
      type: "inside",
      xAxisIndex: [0, 1, 2],
      zoomOnMouseWheel: true,
    });
    expect(JSON.stringify(RESULT_FIXTURE.samples)).toBe(before);
  });

  it("shows three equal elapsed-time axes while keeping zoom wheel-only", () => {
    const second = {
      ...RESULT_FIXTURE.samples[0],
      index: 1,
      sim_time_seconds: 172800,
    };
    const option = buildZoneAirStateChartOption({
      ...RESULT_FIXTURE,
      sample_count: 2,
      samples: [RESULT_FIXTURE.samples[0], second],
    }, copy);
    const xAxes = option.xAxis as Array<{ min: number; max: number; name: string; axisLabel: { show: boolean } }>;
    expect(xAxes).toHaveLength(3);
    expect(xAxes.every((axis) => axis.name === "Elapsed time (s)" && axis.axisLabel.show)).toBe(true);
    expect(new Set(xAxes.map((axis) => `${axis.min}:${axis.max}`))).toEqual(new Set(["0:172800"]));
    const grids = option.grid as Array<{ left: number; right: number }>;
    expect(new Set(grids.map((grid) => `${grid.left}:${grid.right}`))).toEqual(new Set(["76:28"]));
    expect(option.dataZoom).toEqual([
      expect.objectContaining({ type: "inside", zoomOnMouseWheel: true }),
    ]);
  });

  it("builds tooltip text from the exact sample values", () => {
    const option = buildZoneAirStateChartOption(RESULT_FIXTURE, copy);
    const formatter = (option.tooltip as { formatter: (value: unknown) => string }).formatter;
    expect(formatter([{ axisValue: 0 }])).toContain("293.15 K");
    expect(formatter([{ axisValue: 0 }])).toContain("-1.4222 Pa");
    expect(formatter([{ axisValue: 0 }])).toContain("1.2041 kg/m³");
  });

  it("initializes once, resizes through the observer and disposes both resources", () => {
    const chart = {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispatchAction: vi.fn(),
      dispose: vi.fn(),
    };
    let resize: (() => void) | null = null;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    const createChart = vi.fn(() => chart);
    const controller = attachZoneAirStateChart(
      {} as HTMLElement,
      createChart,
      (callback) => {
        resize = callback;
        return observer;
      },
    );
    controller.setOption({ animation: false });
    controller.setOption({ animation: false });
    expect(createChart).toHaveBeenCalledTimes(1);
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    (resize as unknown as () => void)();
    expect(chart.resize).toHaveBeenCalledTimes(1);
    controller.resetZoom();
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: "dataZoom", start: 0, end: 100 });
    controller.dispose();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(chart.dispose).toHaveBeenCalledTimes(1);
  });

  it("rebuilds localized labels and CSS-derived theme colors without changing data", () => {
    const palette = {
      text: "#111111",
      muted: "#222222",
      border: "#333333",
      surface: "#444444",
      temperature: "#aa0000",
      pressure: "#00aa00",
      density: "#0000aa",
    };
    const localized = { ...copy, temperature: "温度", pressure: "参考压力", density: "空气密度", language: "zh-CN" as const };
    const option = buildZoneAirStateChartOption(RESULT_FIXTURE, localized, palette);
    expect(option.color).toEqual(["#aa0000", "#00aa00", "#0000aa"]);
    expect((option.legend as { data: string[] }).data).toEqual(["温度", "参考压力", "空气密度"]);
    expect((option.textStyle as { color: string }).color).toBe("#111111");
  });

  it("registers only the required modular ECharts surface", () => {
    const source = buildZoneAirStateChartOption.toString();
    expect(source).not.toContain("sampling");
    expect(source).not.toContain("smooth: true");
  });
});
