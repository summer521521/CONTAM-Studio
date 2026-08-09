import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "tool";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  className,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = ["ui-button", `ui-button-${variant}`, className].filter(Boolean).join(" ");
  return (
    <button
      {...props}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {icon}
      {loading ? <span className="ui-button-loading" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
