import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { AppCloseDialog } from "./AppCloseDialog";
import { DraftSwitchDialog } from "./DraftSwitchDialog";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { WorkbenchPanels, type WorkbenchPanelsProps } from "./WorkbenchPanels";
import { ZoneVolumePatchDialog } from "./ZoneVolumePatchDialog";
import { IconButton } from "../ui/IconButton";

type PanelRef = ComponentProps<typeof Panel>["panelRef"];

export interface WorkbenchShellProps {
  workbenchPanels: Omit<WorkbenchPanelsProps, "workbench" | "layoutRevision" | "initialMainLayout" | "initialCenterLayout" | "projectPanelRef" | "contextPanelRef" | "bottomPanelRef" | "onMainLayout" | "onCenterLayout">;
  workbench: WorkbenchPanelsProps["workbench"];
  layoutRevision: number;
  initialMainLayout: Layout;
  initialCenterLayout: Layout;
  projectPanelRef: PanelRef;
  contextPanelRef: PanelRef;
  bottomPanelRef: PanelRef;
  onMainLayout: (layout: Layout) => void;
  onCenterLayout: (layout: Layout) => void;
  topBar: ComponentProps<typeof TopBar>;
  statusBar: ComponentProps<typeof StatusBar>;
  placeholderNotice: string | null;
  dismissPlaceholder: () => void;
  placeholderDismissLabel: string;
  patchDialog: ComponentProps<typeof ZoneVolumePatchDialog> | null;
  draftSwitchDialog: ComponentProps<typeof DraftSwitchDialog> | null;
  closeDialog: ComponentProps<typeof AppCloseDialog> | null;
}

export function WorkbenchShell({
  workbenchPanels,
  workbench,
  layoutRevision,
  initialMainLayout,
  initialCenterLayout,
  projectPanelRef,
  contextPanelRef,
  bottomPanelRef,
  onMainLayout,
  onCenterLayout,
  topBar,
  statusBar,
  placeholderNotice,
  dismissPlaceholder,
  placeholderDismissLabel,
  patchDialog,
  draftSwitchDialog,
  closeDialog,
}: WorkbenchShellProps) {
  return (
    <div className="app-shell">
      <TopBar {...topBar} />
      <WorkbenchPanels
        {...workbenchPanels}
        workbench={workbench}
        layoutRevision={layoutRevision}
        initialMainLayout={initialMainLayout}
        initialCenterLayout={initialCenterLayout}
        projectPanelRef={projectPanelRef}
        contextPanelRef={contextPanelRef}
        bottomPanelRef={bottomPanelRef}
        onMainLayout={onMainLayout}
        onCenterLayout={onCenterLayout}
      />
      <StatusBar {...statusBar} />

      {placeholderNotice ? (
        <div className="placeholder-toast" role="status" aria-live="polite">
          <span>{placeholderNotice}</span>
          <IconButton
            className="panel-icon-button"
            label={placeholderDismissLabel}
            title={placeholderDismissLabel}
            onClick={dismissPlaceholder}
          >
            <X size={15} />
          </IconButton>
        </div>
      ) : null}

      {patchDialog ? <ZoneVolumePatchDialog {...patchDialog} /> : null}
      {draftSwitchDialog ? <DraftSwitchDialog {...draftSwitchDialog} /> : null}
      {closeDialog ? <AppCloseDialog {...closeDialog} /> : null}
    </div>
  );
}
