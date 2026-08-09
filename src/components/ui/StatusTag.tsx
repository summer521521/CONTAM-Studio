import type { HTMLAttributes, ReactNode } from "react";

export interface StatusTagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "error";
  children: ReactNode;
}

export function StatusTag({ tone = "neutral", className, children, ...props }: StatusTagProps) {
  const classes = ["ui-status-tag", className].filter(Boolean).join(" ");
  return (
    <span {...props} className={classes} data-tone={tone}>
      {children}
    </span>
  );
}
