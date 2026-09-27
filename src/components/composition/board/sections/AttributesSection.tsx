'use client';

import { useState, useSyncExternalStore } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Collapsible } from '@/components/ui/collapsible';
import { cn } from '@/components/ui/cn';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import type { AttributeKey } from '@/data/eve-data/character-attributes';
import { formatUtcDate } from '@/lib/format/time';
import { SectionBody, updatedLabel } from '../SectionBody';

const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  intelligence: 'Intelligence',
  memory: 'Memory',
  perception: 'Perception',
  willpower: 'Willpower',
  charisma: 'Charisma',
};

type Attributes = Extract<BoardCharacter['attributes'], { state: 'ready' }>['data'];
type Implants = Extract<BoardCharacter['implants'], { state: 'ready' }>['data'];

const DESKTOP = '(min-width: 1024px)';

function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useOpenOnDesktop(): [boolean, (open: boolean) => void] {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const [toggled, setToggled] = useState<boolean | null>(null);
  return [toggled ?? desktop, setToggled];
}

export function AttributesSection({
  attributes,
  implants,
  now,
  className,
}: {
  attributes: BoardCharacter['attributes'];
  implants: BoardCharacter['implants'];
  now: number;
  className?: string;
}) {
  const [open, setOpen] = useOpenOnDesktop();
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-card border border-border-soft bg-bg-deep/40', className)}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        headerClassName="bg-row-hover px-3.5 py-2"
        header={
          <span className="flex w-full items-center justify-between gap-2">
            <span className={eyebrow({ weight: 'semibold', emphasis: 'strong' })}>
              <span aria-hidden className="mr-2 inline-block text-faint transition-transform group-open:rotate-90">
                ›
              </span>
              Attributes &amp; implants
            </span>
            <span className="text-micro text-muted">{updatedLabel(attributes, now)}</span>
          </span>
        }
      >
        <SectionBody section={attributes}>{(data) => <AttributeGrid attributes={data} />}</SectionBody>
        <SectionHeader label="Implants" variant="bar" className="border-t" />
        <SectionBody section={implants}>{(data) => <ImplantList implants={data} />}</SectionBody>
      </Collapsible>
    </div>
  );
}

function AttributeGrid({ attributes }: { attributes: Attributes }) {
  return (
    <div className="flex flex-col gap-3 px-3.5 py-3">
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        {attributes.values.map((value) => (
          <div key={value.key} className="flex flex-col gap-0.5">
            <dt className={eyebrow({ size: 'micro' })}>{ATTRIBUTE_LABEL[value.key]}</dt>
            <dd className="font-data text-h3 tabular-nums text-name">
              {value.base + value.implant}
              {value.implant > 0 && <span className="ml-1 text-micro text-isk">(+{value.implant})</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="font-data text-micro text-muted">
        {attributes.bonusRemaps} bonus {attributes.bonusRemaps === 1 ? 'remap' : 'remaps'} ·{' '}
        {attributes.nextRemapDate !== null
          ? `next remap ${formatUtcDate(attributes.nextRemapDate)}`
          : 'remap available now'}
      </p>
    </div>
  );
}

function ImplantList({ implants }: { implants: Implants }) {
  if (implants.implants.length === 0) {
    return <p className="px-3.5 py-2.5 text-ui text-faint">No implants plugged in.</p>;
  }
  const ordered = [...implants.implants].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  return (
    <div className="pb-1">
      {ordered.map((implant) => (
        <EntityRow
          key={implant.typeId}
          colsClass="grid-cols-[22px_minmax(0,1fr)_auto]"
          leading={<TypeIcon typeId={implant.typeId} size={22} alt="" />}
          name={implant.name}
          trailing={
            <span className="font-data text-micro text-muted">
              {implant.slot !== null ? `slot ${implant.slot}` : ''}
            </span>
          }
        />
      ))}
    </div>
  );
}
