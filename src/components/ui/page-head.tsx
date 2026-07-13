import type { ReactNode } from 'react';

// The terminal-style `lgi://<crumb>` breadcrumb line, on its own so a page that
// can't use the full <PageHead> scaffold (e.g. an entity-detail header with a
// portrait) still opens with the same crumb. The `lgi://` prefix is ISK-green;
// the crumb tail is muted.
export function Breadcrumb({ crumb }: { crumb: string }) {
  return (
    <div className="font-mono text-label tracking-label text-muted mb-2">
      <span className="text-isk">lgi://</span>
      {crumb}
    </div>
  );
}

// Shared inner-page header (the prototype's `.OGP-head`) — the breadcrumb over a
// Barlow uppercase title (sized by the `--text-display` ladder token), with an
// optional left `subtitle` line under the title and an optional right-aligned
// `meta` slot. The ONE page-title system: every inner page (public + signed-in)
// opens with this exact scaffold so titles can't drift page-to-page. The
// `subtitle` carries a page's descriptive sentence; the terse `meta` slot is for
// short uppercase tags or header controls.
export function PageHead({
  crumb,
  title,
  subtitle,
  meta,
}: {
  crumb: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  // Width-agnostic (3.6.11 F1): the shared PageShell owns the outer frame +
  // gutters, so this header carries only its vertical rhythm and spans whatever
  // frame wraps it. Always render PageHead inside a <PageShell>.
  return (
    <header className="w-full pt-[34px] pb-5 flex items-end justify-between gap-x-6 gap-y-3 flex-wrap">
      <div>
        <Breadcrumb crumb={crumb} />
        <h1 className="font-display font-bold text-display leading-none tracking-[0.01em] uppercase text-name">
          {title}
        </h1>
        {subtitle != null && (
          <p className="mt-2 font-mono text-label tracking-label uppercase text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {meta != null && (
        <div className="flex items-baseline gap-[18px] font-mono text-label tracking-label uppercase text-muted pb-[3px]">
          {meta}
        </div>
      )}
    </header>
  );
}
