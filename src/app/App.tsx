import { WorkbenchRuntime } from "./runtime/WorkbenchRuntime";

/**
 * Application lifecycle boundary. Runtime orchestration, journey actions and
 * page view-models live below this entry so the root never owns page JSX.
 */
function App() {
  return <WorkbenchRuntime />;
}

export default App;
