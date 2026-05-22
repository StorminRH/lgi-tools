import type { ReactNode } from 'react';

export function SectionHeader({
  label,
  hint,
}: {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-[5px] bg-section border-b border-border-soft border-t border-t-border text-[9px] font-semibold tracking-[0.16em] uppercase text-muted">
      <span>{label}</span>
      {hint && <span className="text-[9px] font-normal text-[#2a3a4a]">{hint}</span>}
    </div>
  );
}
