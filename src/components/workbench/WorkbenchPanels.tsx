import type { ComponentProps } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import { ActivityBar } from "./ActivityBar";
import { BottomPanel } from "./BottomPanel";
import { ContextSidebar } from "./ContextSidebar";
import { DestinationContent, type DestinationContentProps } from "./DestinationContent";
import { ProjectSidebar } from "./ProjectSidebar";
import { getCenterLayout, getMainLayout, type WorkbenchState } from "../../app/workbench-state";

type PanelRef = ComponentProps<typeof Panel>["panelRef"];

export interface WorkbenchPanelsProps {
  workbench: WorkbenchState;
  layoutRevision: number;
  initialMainLayout: Layout;
  initialCenterLayout: Layout;
  projectPanelRef: PanelRef;
  contextPanelRef: PanelRef;
  bottomPanelRef: PanelRef;
  onMainLayout: (layout: Layout) => void;
  onCenterLayout: (layout: Layout) => void;
  activityBar: ComponentProps<typeof ActivityBar>;
  projectSidebar: ComponentProps<typeof ProjectSidebar>;
  destinationContent: DestinationContentProps;
  bottomPanel: ComponentProps<typeof BottomPanel>;
  contextSidebar: ComponentProps<typeof ContextSidebar>;
}

export function WorkbenchPanels({
  workbench,
  layoutRevision,
  initialMainLayout,
  initialCenterLayout,
  projectPanelRef,
  contextPanelRef,
  bottomPanelRef,
  onMainLayout,
  onCenterLayout,
  activityBar,
  projectSidebar,
  destinationContent,
  bottomPanel,
  contextSidebar,
}: WorkbenchPanelsProps) {
  return (
    <div className="workbench-body">
      <ActivityBar {...activityBar} />

      <Group
        className="main-panels"
        orientation="horizontal"
        key={`main-layout-${layoutRevision}`}
        defaultLayout={layoutRevision === 0 ? initialMainLayout : getMainLayout(workbench)}
        onLayoutChanged={onMainLayout}
      >
        <Panel
          id="project"
          panelRef={projectPanelRef}
          defaultSize={`${workbench.projectSize}%`}
          minSize="220px"
          maxSize="420px"
          collapsible
          collapsedSize="0px"
        >
          <ProjectSidebar {...projectSidebar} />
        </Panel>
        <Separator className="resize-handle resize-handle-horizontal" />
        <Panel id="workspace" minSize="520px">
          <Group
            className="center-panels"
            orientation="vertical"
            key={`center-layout-${layoutRevision}`}
            defaultLayout={layoutRevision === 0 ? initialCenterLayout : getCenterLayout(workbench)}
            onLayoutChanged={onCenterLayout}
          >
            <Panel id="editor" minSize="360px">
              <DestinationContent {...destinationContent} />
            </Panel>
            <Separator className="resize-handle resize-handle-vertical" />
            <Panel
              id="bottom"
              panelRef={bottomPanelRef}
              defaultSize={`${workbench.bottomSize}%`}
              minSize="150px"
              maxSize="360px"
              collapsible
              collapsedSize="0px"
            >
              <BottomPanel {...bottomPanel} />
            </Panel>
          </Group>
        </Panel>
        <Separator className="resize-handle resize-handle-horizontal" />
        <Panel
          id="context"
          panelRef={contextPanelRef}
          defaultSize={`${workbench.contextSize}%`}
          minSize="250px"
          maxSize="440px"
          collapsible
          collapsedSize="0px"
        >
          <ContextSidebar {...contextSidebar} />
        </Panel>
      </Group>
    </div>
  );
}
