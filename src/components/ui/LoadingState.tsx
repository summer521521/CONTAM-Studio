export interface LoadingStateProps {
  label: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite">
      <span className="ui-loading-indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
