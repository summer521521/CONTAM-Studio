import { lazy, Suspense } from "react";
import { WorkbenchRuntime } from "./runtime/WorkbenchRuntime";

const GeometryQualityHarness = import.meta.env.DEV
  ? lazy(async () => ({
    default: (await import("../components/workbench/geometry/GeometryQualityHarness")).GeometryQualityHarness,
  }))
  : null;

/**
 * Application lifecycle boundary. Runtime orchestration, journey actions and
 * page view-models live below this entry so the root never owns page JSX.
 */
function App() {
  const geometryQualityRequested = new URLSearchParams(window.location.search).has("geometry-quality")
    || import.meta.env.VITE_GEOMETRY_QUALITY === "1";
  if (GeometryQualityHarness && geometryQualityRequested) {
    return (
      <Suspense fallback={<main className="geometry-quality-harness" role="status">Loading Geometry Workbench…</main>}>
        <GeometryQualityHarness />
      </Suspense>
    );
  }
  return <WorkbenchRuntime />;
}

export default App;
