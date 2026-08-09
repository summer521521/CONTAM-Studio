import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  const classes = ["ui-empty-state", className].filter(Boolean).join(" ");
  return (
    <section className={classes} aria-live="polite">
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </section>
  );
}
