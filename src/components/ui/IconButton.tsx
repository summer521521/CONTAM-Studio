import type { ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function IconButton({ label, className, type, children, ...props }: IconButtonProps) {
  const accessibleLabel = props["aria-label"] ?? label;
  const classes = ["ui-icon-button", className].filter(Boolean).join(" ");
  return (
    <button
      {...props}
      type={type ?? "button"}
      className={classes}
      aria-label={accessibleLabel}
    >
      {children}
    </button>
  );
}
