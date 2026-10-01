import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionHead } from '@/components/ui/section-head';

export type PrototypeGroupId =
  | 'fields'
  | 'dropdowns'
  | 'skeletons'
  | 'copy'
  | 'pills'
  | 'banners'
  | 'live-price'
  | 'prose'
  | 'toggles'
  | 'progress'
  | 'labels'
  | 'status'
  | 'tables';

/** One primitive family: what ships today, then the candidates. */
export function PrototypeGroup({
  id,
  title,
  today,
  children,
  layout = 'grid',
}: {
  id: PrototypeGroupId;
  title: string;
  today: string;
  children: ReactNode;
  layout?: 'grid' | 'stack';
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5">
      <SectionHead title={title} description={today} />
      <div className={cn('grid gap-4', layout === 'grid' && 'lg:grid-cols-2')}>{children}</div>
    </section>
  );
}

/** One candidate: its letter, a short name, why it fits, and a live render. */
export function VariantCard({
  letter,
  name,
  pitch,
  children,
  wide = false,
}: {
  letter: 'Now' | 'A' | 'B' | 'C' | 'D' | 'E';
  name: string;
  pitch: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const current = letter === 'Now';
  return (
    <Card className={cn('flex min-w-0 flex-col gap-4 p-5', wide && 'lg:col-span-2')} data-variant={letter}>
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 font-ui text-ui font-semibold',
            current ? 'border border-border-active text-muted' : 'bg-brand-gradient text-isk-ink shadow-cta-glow',
          )}
        >
          {letter}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-ui text-nav font-semibold text-name">{name}</h3>
          <p className="font-ui text-ui text-muted">{pitch}</p>
        </div>
      </header>
      <div className="pt-stage min-w-0">{children}</div>
    </Card>
  );
}

/** A small caption over a state in a variant (focus, error, pending…). */
function StateLabel({ children }: { children: ReactNode }) {
  return <span className="font-ui text-micro uppercase tracking-wide text-faint">{children}</span>;
}

export function StateGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn(
        'grid gap-x-5 gap-y-5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}

export function StateCell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <StateLabel>{label}</StateLabel>
      {children}
    </div>
  );
}
