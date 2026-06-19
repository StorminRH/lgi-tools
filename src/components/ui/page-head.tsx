import type { ReactNode } from 'react';

// Shared inner-page header (the prototype's `.OGP-head`) — a terminal-style
// `lgi://<crumb>` breadcrumb over a Barlow uppercase title, with an optional
// right-aligned `meta` slot. Used by /sites, /industry, and the static pages so
// every inner page opens with the same scaffold. The `lgi://` prefix is
// ISK-green; the crumb tail is muted.
export function PageHead({
  crumb,
  title,
  meta,
}: {
  crumb: string;
  title: string;
  meta?: ReactNode;
}) {
  // Width-agnostic (3.6.11 F1): the shared PageShell owns the outer frame +
  // gutters, so this header carries only its vertical rhythm and spans whatever
  // frame wraps it. Always render PageHead inside a <PageShell>.
  return (
    <header className="w-full pt-[34px] pb-5 flex items-end justify-between gap-x-6 gap-y-3 flex-wrap">
      <div>
        <div className="font-mono text-caption tracking-[0.08em] text-muted mb-2">
          <span className="text-isk">lgi://</span>
          {crumb}
        </div>
        <h1 className="font-display font-bold text-[clamp(26px,3.2vw,36px)] leading-none tracking-[0.01em] uppercase text-name">
          {title}
        </h1>
      </div>
      {meta != null && (
        <div className="flex items-baseline gap-[18px] font-mono text-caption tracking-[0.08em] uppercase text-muted pb-[3px]">
          {meta}
        </div>
      )}
    </header>
  );
}
