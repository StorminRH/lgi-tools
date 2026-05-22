import type { ReactNode } from 'react';

export function MetricBlock({
  value,
  sub,
}: {
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="text-right shrink-0">
      <div className="text-[15px] font-semibold text-isk whitespace-nowrap leading-[1.2]">
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-muted mt-[3px] tracking-[0.03em] leading-[1.4]">
          {sub}
        </div>
      )}
    </div>
  );
}
