import { Info } from "lucide-react";

interface HoverHintProps {
  label: string;
}

/** Keeps secondary product guidance available without occupying the main layout. */
export function HoverHint({ label }: HoverHintProps) {
  return (
    <span className="hover-hint" role="img" tabIndex={0} title={label} aria-label={label}>
      <Info size={14} aria-hidden="true" />
    </span>
  );
}
