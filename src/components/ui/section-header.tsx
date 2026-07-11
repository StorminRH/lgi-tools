import type { ReactNode } from 'react';

// `size` widens the header for dense dashboard cards: 'sm' is the sitewide
// default; 'md' reads at 11px for pages (admin) whose primary content is the
// card headers themselves.
export function SectionHeader({
  label,
  hint,
  size = 'sm',
}: {
  label: ReactNode;
  hint?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const sizing =
    size === 'md' ? 'px-3.5 py-2 text-label' : 'px-3.5 py-[5px] text-micro';
  const hintSizing = 'text-micro';
  return (
    <div
      className={`flex items-center justify-between bg-section border-b border-border-soft border-t border-t-border font-semibold tracking-[0.16em] uppercase text-muted ${sizing}`}
    >
      <span>{label}</span>
      {hint && <span className={`${hintSizing} font-normal text-muted`}>{hint}</span>}
    </div>
  );
}
