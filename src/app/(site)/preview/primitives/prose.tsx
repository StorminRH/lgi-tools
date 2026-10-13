import Link from 'next/link';
import type { ReactNode } from 'react';
import { Prose } from '@/components/ui/prose';
import { dataLabel, displayTitle, eyebrow, pageTitle } from '@/components/ui/type-roles';
import { ReferenceGroup, Specimen } from './specimen';

// Each label role in use, spelled as its call, so labels can be compared side by side.
const LABEL_ROLES: readonly { call: string; classes: string }[] = [
  { call: 'eyebrow()', classes: eyebrow() },
  { call: "eyebrow({ emphasis: 'strong' })", classes: eyebrow({ emphasis: 'strong' }) },
  { call: "eyebrow({ emphasis: 'label' })", classes: eyebrow({ emphasis: 'label' }) },
  { call: 'dataLabel()', classes: dataLabel() },
  { call: "dataLabel({ emphasis: 'strong' })", classes: dataLabel({ emphasis: 'strong' }) },
  {
    call: "eyebrow({ font: 'inherit', weight: 'inherit' })",
    classes: eyebrow({ font: 'inherit', weight: 'inherit' }),
  },
  {
    call: "eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'label' })",
    classes: eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'label' }),
  },
  {
    call: "eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'strong' })",
    classes: eyebrow({ font: 'inherit', weight: 'inherit', emphasis: 'strong' }),
  },
  {
    call: "eyebrow({ font: 'inherit', weight: 'semibold', emphasis: 'strong' })",
    classes: eyebrow({ font: 'inherit', weight: 'semibold', emphasis: 'strong' }),
  },
];

function RoleSample({ call, children }: { call: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <code className="font-data text-micro text-faint">{call}</code>
      {children}
    </div>
  );
}

export function ProseGroup() {
  return (
    <ReferenceGroup
      id="prose"
      title="Prose"
      intro="Long-form reading copy for legal pages and written explanations, and the type roles that title and label the rest of the app."
    >
      <Specimen
        name="Type roles"
        source="type-roles"
        note="Class recipes rather than components: pageTitle and displayTitle for titles, eyebrow and dataLabel for uppercase labels. The inherit values take the parent's face and weight, as each label's own context would."
        wide
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleSample call="pageTitle({ size: 'compact' })">
              <span className={pageTitle({ size: 'compact' })}>Section title</span>
            </RoleSample>
            <RoleSample call="displayTitle({ size: 'h3' })">
              <span className={displayTitle({ size: 'h3' })}>Panel title</span>
            </RoleSample>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LABEL_ROLES.map(({ call, classes }) => (
              <RoleSample key={call} call={call}>
                <span className={classes}>Last price update</span>
              </RoleSample>
            ))}
          </div>
        </div>
      </Specimen>

      <Specimen
        name="Prose"
        source="prose"
        note="Descendant styles for paragraphs, emphasis, and links, held to a readable measure."
        wide
      >
        <Prose className="mx-0">
          <p>
            LGI.tools stores only the account and ESI data needed to provide the tools you use. <strong>We never
            sell or share it</strong>, and you can unlink a character at any time from settings.
          </p>
          <p>
            Prices come from public market snapshots refreshed through the day. Read more in the{' '}
            <Link href="/changelog">changelog</Link> or ask in the corporation channel.
          </p>
        </Prose>
      </Specimen>
    </ReferenceGroup>
  );
}
