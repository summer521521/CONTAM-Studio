import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelRef, type Layout } from "react-resizable-panels";
import i18n from "../../i18n";
import {
  getCenterLayout,
  getMainLayout,
  loadWorkbenchState,
  resetWorkbenchLayout,
  saveWorkbenchState,
  type BottomTab,
  type ContextTab,
  type WorkbenchDestination,
  type WorkbenchState,
} from "../workbench-state";

export function useWorkbenchLayout() {
  const [workbench, setWorkbench] = useState(loadWorkbenchState);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [activeDestination, setActiveDestination] = useState<WorkbenchDestination>("project");
  const initialMainLayout = useRef(getMainLayout(workbench)).current;
  const initialCenterLayout = useRef(getCenterLayout(workbench)).current;
  const projectPanelRef = usePanelRef();
  const contextPanelRef = usePanelRef();
  const bottomPanelRef = usePanelRef();

  const updateWorkbench = useCallback((patch: Partial<WorkbenchState>) => {
    setWorkbench((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    document.documentElement.lang = workbench.language;
    void i18n.changeLanguage(workbench.language);
  }, [workbench.language]);

  useEffect(() => {
    document.documentElement.dataset.theme = workbench.theme;
  }, [workbench.theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveWorkbenchState(workbench), 200);
    return () => window.clearTimeout(timer);
  }, [workbench]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const compact = window.matchMedia("(max-width: 1279px)");
    const narrow = window.matchMedia("(max-width: 1023px)");
    const applyResponsiveDefaults = () => {
      if (compact.matches) {
        contextPanelRef.current?.collapse();
        updateWorkbench({ contextCollapsed: true });
      }
      if (narrow.matches) {
        projectPanelRef.current?.collapse();
        updateWorkbench({ projectCollapsed: true });
      }
    };
    applyResponsiveDefaults();
    compact.addEventListener("change", applyResponsiveDefaults);
    narrow.addEventListener("change", applyResponsiveDefaults);
    return () => {
      compact.removeEventListener("change", applyResponsiveDefaults);
      narrow.removeEventListener("change", applyResponsiveDefaults);
    };
  }, [contextPanelRef, projectPanelRef, updateWorkbench]);

  const toggleProject = useCallback(() => {
    if (workbench.projectCollapsed) projectPanelRef.current?.expand();
    else projectPanelRef.current?.collapse();
    updateWorkbench({ projectCollapsed: !workbench.projectCollapsed });
  }, [projectPanelRef, updateWorkbench, workbench.projectCollapsed]);

  const toggleContext = useCallback(() => {
    if (workbench.contextCollapsed) contextPanelRef.current?.expand();
    else contextPanelRef.current?.collapse();
    updateWorkbench({ contextCollapsed: !workbench.contextCollapsed });
  }, [contextPanelRef, updateWorkbench, workbench.contextCollapsed]);

  const toggleBottom = useCallback(() => {
    if (workbench.bottomCollapsed) bottomPanelRef.current?.expand();
    else bottomPanelRef.current?.collapse();
    updateWorkbench({ bottomCollapsed: !workbench.bottomCollapsed });
  }, [bottomPanelRef, updateWorkbench, workbench.bottomCollapsed]);

  const openBottom = useCallback((bottomTab: BottomTab) => {
    bottomPanelRef.current?.expand();
    updateWorkbench({ bottomCollapsed: false, bottomTab });
  }, [bottomPanelRef, updateWorkbench]);

  const openContext = useCallback((contextTab: ContextTab) => {
    contextPanelRef.current?.expand();
    updateWorkbench({ contextCollapsed: false, contextTab });
  }, [contextPanelRef, updateWorkbench]);

  const navigateToDestination = useCallback((destination: WorkbenchDestination) => {
    setActiveDestination(destination);
    if (destination === "project") {
      projectPanelRef.current?.expand();
      updateWorkbench({ projectCollapsed: false });
    }
    if (destination === "run") openBottom("logs");
    if (destination === "results") openBottom("results");
  }, [openBottom, projectPanelRef, updateWorkbench]);

  const restoreWorkbenchLayout = useCallback(() => {
    const next = resetWorkbenchLayout(workbench);
    projectPanelRef.current?.expand();
    contextPanelRef.current?.expand();
    bottomPanelRef.current?.collapse();
    setWorkbench(next);
    setLayoutRevision((current) => current + 1);
  }, [bottomPanelRef, contextPanelRef, projectPanelRef, workbench]);

  const handleMainLayout = useCallback((layout: Layout) => {
    setWorkbench((current) => {
      const project = layout.project ?? 0;
      const context = layout.context ?? 0;
      const next: WorkbenchState = {
        ...current,
        projectSize: project > 0.1 ? project : current.projectSize,
        contextSize: context > 0.1 ? context : current.contextSize,
        projectCollapsed: project <= 0.1,
        contextCollapsed: context <= 0.1,
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, []);

  const handleCenterLayout = useCallback((layout: Layout) => {
    setWorkbench((current) => {
      const bottom = layout.bottom ?? 0;
      const next: WorkbenchState = {
        ...current,
        bottomSize: bottom > 0.1 ? bottom : current.bottomSize,
        bottomCollapsed: bottom <= 0.1,
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, []);

  return {
    workbench,
    layoutRevision,
    activeDestination,
    setActiveDestination,
    updateWorkbench,
    initialMainLayout,
    initialCenterLayout,
    projectPanelRef,
    contextPanelRef,
    bottomPanelRef,
    toggleProject,
    toggleContext,
    toggleBottom,
    openBottom,
    openContext,
    navigateToDestination,
    restoreWorkbenchLayout,
    handleMainLayout,
    handleCenterLayout,
  };
}
