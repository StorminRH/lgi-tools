import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
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
  return (
    <div className="mb-2 font-data text-label tracking-label text-muted">
      <span className="text-isk">lgi://</span>
      {crumb}
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
}: {
  crumb: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  size?: PageTitleSize;
}) {
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
        <div className="flex items-baseline gap-[18px] pb-[3px]">
          {meta}
        </div>
      )}
    </header>
  );
}
