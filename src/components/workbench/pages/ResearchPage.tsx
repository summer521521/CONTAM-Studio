import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../app/project-state";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import type { AppTheme, WorkbenchDestination } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";
import { StudyWorkspace } from "../StudyWorkspace";

export interface ResearchPageProps {
  projectState: ProjectState;
  projectSessionId: string | null;
  revisionId: string | null;
  semanticSnapshot: SemanticSnapshot | null;
  theme: AppTheme;
  onNotice: (message: string) => void;
  onNavigate: (destination: WorkbenchDestination) => void;
}

export function ResearchPage({ projectState, projectSessionId, revisionId, semanticSnapshot, theme, onNotice, onNavigate }: ResearchPageProps) {
  const { t } = useTranslation();
  if (!projectState.project || !projectSessionId || !revisionId) {
    return <EmptyState title={t("journeys.research.noProject")} action={<Button variant="primary" onClick={() => onNavigate("project")}>{t("journeys.goProject")}</Button>} />;
  }
  return (
    <section className="journey-page research-journey" aria-labelledby="research-page-title">
      <PageHeader eyebrow={t("journeys.research.eyebrow")} title={t("journeys.research.title")} description={t("journeys.research.description")} />
      <StudyWorkspace project={projectState.project} projectSessionId={projectSessionId} revisionId={revisionId} semanticSnapshot={semanticSnapshot} theme={theme} onNotice={onNotice} />
    </section>
  );
}
