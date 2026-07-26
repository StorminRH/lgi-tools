import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

type PageTitleSize = 'hero' | 'page' | 'compact';

const pageTitle = cva(
  'font-display font-bold leading-none tracking-optical uppercase text-name',
  {
    variants: {
      size: {
        hero: 'text-display',
        page: 'text-title',
        compact: 'text-h2',
      },
    },
    defaultVariants: { size: 'page' },
  },
);

const pageSubtitle = cva('mt-2 text-muted', {
  variants: {
    size: {
      hero: 'font-ui text-body leading-relaxed',
      page: 'font-ui text-ui',
      compact: 'font-data text-label tracking-label uppercase',
    },
  },
  defaultVariants: { size: 'page' },
});

/**
 * The terminal-style `lgi://<crumb>` breadcrumb line, on its own so a page that
 * can't use the full <PageHead> scaffold (e.g. an entity-detail header with a
 * portrait) still opens with the same crumb. The `lgi://` prefix is ISK-green;
 * the crumb tail is muted.
 */
export function Breadcrumb({ crumb }: { crumb: string }) {
  return (
    <div className="mb-2 font-data text-label tracking-label text-muted">
      <span className="text-isk">lgi://</span>
      {crumb}
    </div>
  );
}

/**
 * The page-title recipe on its own, for entity headers that cannot use the full
 * scaffold. This is the same carve-out Breadcrumb already makes, so portrait
 * headers still wear the one title treatment.
 */
export function PageTitle({
  size = 'page',
  className,
  children,
}: {
  size?: PageTitleSize;
  className?: string;
  children: ReactNode;
}) {
  return <h1 className={cn(pageTitle({ size }), className)}>{children}</h1>;
}

/**
 * Shared inner-page header (the prototype's `.OGP-head`) — the breadcrumb over a
 * Barlow uppercase title (sized by the `--text-display` ladder token), with an
 * optional left `subtitle` line under the title and an optional right-aligned
 * `meta` slot. The ONE page-title system: every inner page (public + signed-in)
 * opens with this exact scaffold so titles can't drift page-to-page. The
 * `subtitle` carries a page's descriptive sentence; the terse `meta` slot is for
 * short uppercase tags or header controls.
 */
export function PageHead({
  crumb,
  title,
  subtitle,
  meta,
  size = 'page',
}: {
  crumb: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  size?: PageTitleSize;
}) {
  // Width-agnostic (3.6.11 F1): the shared PageShell owns the outer frame +
  // gutters, so this header carries only its vertical rhythm and spans whatever
  // frame wraps it. Always render PageHead inside a <PageShell>.
  return (
    <header className="w-full pt-[34px] pb-5 flex items-end justify-between gap-x-6 gap-y-3 flex-wrap">
      <div>
        <Breadcrumb crumb={crumb} />
        <PageTitle size={size}>{title}</PageTitle>
        {subtitle != null && (
          <p className={pageSubtitle({ size })}>{subtitle}</p>
        )}
      </div>
      {meta != null && (
        <div className={eyebrow({ className: 'flex items-baseline gap-[18px] pb-[3px]' })}>
          {meta}
        </div>
      )}
    </header>
  );
}
