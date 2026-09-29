'use client';

import { TypeIcon } from '@/components/type-icon';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import type { AttributeKey } from '@/data/eve-data/character-attributes';
import { formatUtcDate } from '@/lib/format/time';
import { SectionPanel, SectionBody } from '../SectionBody';

const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  intelligence: 'Intelligence',
  memory: 'Memory',
  perception: 'Perception',
  willpower: 'Willpower',
  charisma: 'Charisma',
};

type Attributes = Extract<BoardCharacter['attributes'], { state: 'ready' }>['data'];
type Implants = Extract<BoardCharacter['implants'], { state: 'ready' }>['data'];

export function AttributesSection({
  attributes,
  implants,
  className,
}: {
  attributes: BoardCharacter['attributes'];
  implants: BoardCharacter['implants'];
  className?: string;
}) {
  return (
    <SectionPanel title="Attributes & implants" className={className}>
      <SectionBody section={attributes}>{(data) => <AttributeGrid attributes={data} />}</SectionBody>
      <SectionHeader label="Implants" variant="bar" className="border-t" />
      <SectionBody section={implants}>{(data) => <ImplantList implants={data} />}</SectionBody>
    </SectionPanel>
  );
}

function AttributeGrid({ attributes }: { attributes: Attributes }) {
  return (
    <div className="@container flex flex-col gap-3 px-3.5 py-3">
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2.5 @xl:grid-cols-5">
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
  return (
    <div className="pb-1">
      {implants.implants.map((implant) => (
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
