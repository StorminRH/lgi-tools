import type { ReactNode } from 'react';

/**
 * Renders the domain-neutral section footer with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function SectionFooter({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex justify-end gap-[6px] items-center px-3.5 pt-[5px] pb-[7px] text-micro text-muted border-t border-border-soft">
      <span>{label}</span>
      <span className="text-isk text-ui font-semibold">{value}</span>
    </div>
  );
}
