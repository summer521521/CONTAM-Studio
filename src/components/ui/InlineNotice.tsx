import type { HTMLAttributes, ReactNode } from "react";

export interface InlineNoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "warning" | "error";
  children: ReactNode;
}

export function InlineNotice({ tone = "info", className, children, ...props }: InlineNoticeProps) {
  const classes = ["ui-inline-notice", className].filter(Boolean).join(" ");
  return (
    <div {...props} className={classes} data-tone={tone} role={props.role ?? "status"}>
      {children}
    </div>
  );
}
