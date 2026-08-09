import type { InputHTMLAttributes, ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  description?: ReactNode;
}

export function Field({ label, description, id, className, ...props }: FieldProps) {
  const controlId = id ?? props.name;
  const descriptionId = description && controlId ? `${controlId}-description` : undefined;
  const classes = ["ui-field-control", className].filter(Boolean).join(" ");
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <input {...props} id={controlId} className={classes} aria-describedby={descriptionId} />
      {descriptionId ? <span id={descriptionId}>{description}</span> : null}
    </label>
  );
}
