import type { ReactNode } from 'react';

export function Callout({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-3.5 mb-2 mt-2 px-2.5 py-[5px] bg-callout-bg border border-callout-border border-l-2 border-l-callout-rule text-[10px] text-dps-mid tracking-[0.03em] flex items-center gap-2">
      <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-callout-label shrink-0">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
