import { cva } from 'class-variance-authority';
import { Fragment, type ReactNode } from 'react';
import { cn } from './cn';

export type PageTitleSize = 'hero' | 'page' | 'compact';

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

export function Breadcrumb({ crumb }: { crumb: string }) {
  const parts = crumb.split('/').map((part) => part.trim()).filter(Boolean);
  const current = parts.pop();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 font-ui text-ui capitalize text-muted">
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          <span>{part}</span>
          <span aria-hidden className="text-faint">/</span>
        </Fragment>
      ))}
      {current ? <span className="rounded-full bg-border px-2.5 py-0.5 text-name">{current}</span> : null}
    </div>
  );
}

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

export function PageHead({
  crumb,
  title,
  subtitle,
  meta,
  size = 'page',
  reveal = true,
}: {
  crumb: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  size?: PageTitleSize;
  // False for a head whose title is already on screen from a Suspense
  // fallback: fading in again would blink it.
  reveal?: boolean;
}) {
  return (
    <header
      className={cn(
        reveal && 'reveal',
        'w-full pt-[34px] pb-5 flex items-end justify-between gap-x-6 gap-y-3 flex-wrap',
      )}
    >
      <div>
        <Breadcrumb crumb={crumb} />
        <PageTitle size={size}>{title}</PageTitle>
        {subtitle != null && (
          <p className={pageSubtitle({ size })}>{subtitle}</p>
        )}
      </div>
      {meta != null && (
        <div className="flex items-baseline gap-[18px] pb-[3px]">
          {meta}
        </div>
      )}
    </header>
  );
}
