import type { DetailsHTMLAttributes, ReactNode } from "react";

export interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  label: ReactNode;
  children: ReactNode;
}

export function Disclosure({ label, children, className, ...props }: DisclosureProps) {
  return (
    <details {...props} className={["ui-disclosure", className].filter(Boolean).join(" ")}>
      <summary>{label}</summary>
      <div className="ui-disclosure-content">{children}</div>
    </details>
  );
}
