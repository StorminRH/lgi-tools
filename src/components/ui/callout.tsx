import type { ReactNode } from 'react';

export function Callout({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-3.5 mb-2 mt-2 px-2.5 py-[5px] bg-[rgba(255,140,0,0.06)] border border-[rgba(255,140,0,0.18)] border-l-2 border-l-[rgba(255,140,0,0.45)] text-[10px] text-[#ffaa22] tracking-[0.03em] flex items-center gap-2">
      <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-[#cc8800] shrink-0">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
