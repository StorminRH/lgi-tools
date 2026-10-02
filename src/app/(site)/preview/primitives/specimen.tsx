import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionHead } from '@/components/ui/section-head';
import { eyebrow } from '@/components/ui/type-roles';

export type ReferenceGroupId =
  | 'actions'
  | 'forms'
  | 'choices'
  | 'tags'
  | 'feedback'
  | 'overlays'
  | 'navigation'
  | 'structure'
  | 'data'
  | 'prose';

/** One family of primitives: an anchor target with its specimens in a grid. */
export function ReferenceGroup({
  id,
  title,
  intro,
  children,
}: {
  id: ReferenceGroupId;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5">
      <SectionHead title={title} description={intro} />
      <div className="grid gap-4 xl:grid-cols-2">{children}</div>
    </section>
  );
}

/** One primitive on a glass card: its name, the module it lives in, and a live render. */
export function Specimen({
  name,
  source,
  note,
  wide = false,
  children,
}: {
  name: string;
  source: string;
  note: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col gap-4 p-5', wide && 'xl:col-span-2')}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-ui text-nav font-semibold text-name">{name}</h3>
          <code className="font-data text-micro text-faint">@/components/ui/{source}</code>
        </div>
        <p className="max-w-[680px] font-ui text-ui text-muted">{note}</p>
      </header>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

/** A labelled cell inside a specimen, for showing variants side by side. */
export function Variant({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={eyebrow({ size: 'micro', tone: 'faint' })}>{label}</span>
      {children}
    </div>
  );
}
