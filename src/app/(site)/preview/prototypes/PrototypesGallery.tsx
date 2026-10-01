'use client';

import { BannersGroup } from './banners';
import { CopyGroup } from './copy';
import { DropdownsGroup } from './dropdowns';
import { LabelsGroup, StatusGroup } from './extras-display';
import { ProgressGroup, TablesGroup, TogglesGroup } from './extras-controls';
import { FieldsGroup } from './fields';
import type { PrototypeGroupId } from './gallery';
import { LivePriceGroup } from './live-price';
import { PillsGroup } from './pills';
import { ProseGroup } from './prose';
import { SkeletonsGroup } from './skeletons';

const REQUESTED: readonly { id: PrototypeGroupId; label: string }[] = [
  { id: 'fields', label: 'Fields' },
  { id: 'dropdowns', label: 'Dropdowns' },
  { id: 'skeletons', label: 'Skeletons' },
  { id: 'copy', label: 'Copy' },
  { id: 'pills', label: 'Pills' },
  { id: 'banners', label: 'Banners' },
  { id: 'live-price', label: 'Live price' },
  { id: 'prose', label: 'Prose' },
];

const FROM_AUDIT: readonly { id: PrototypeGroupId; label: string }[] = [
  { id: 'toggles', label: 'Toggles' },
  { id: 'progress', label: 'Progress' },
  { id: 'labels', label: 'Labels' },
  { id: 'status', label: 'Status + empty' },
  { id: 'tables', label: 'Tables' },
];

function JumpLinks({ title, links }: { title: string; links: readonly { id: PrototypeGroupId; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-ui text-label font-medium text-faint">{title}</span>
      {links.map((link) => (
        <a key={link.id} href={`#${link.id}`} className="pt-toggle-chip no-underline">
          {link.label}
        </a>
      ))}
    </div>
  );
}

/**
 * Glass-direction prototypes for the primitive refresh. Each family shows the
 * shipping primitive (“Now”) beside five candidates (A–E); extras from the
 * audit get three to five. Pick per family, then port the winner into
 * src/components/ui and its specimen on /preview/primitives.
 */
export function PrototypesGallery() {
  return (
    <div className="flex flex-col gap-14 pb-16">
      <div className="flex flex-col gap-3">
        <JumpLinks title="Requested" links={REQUESTED} />
        <JumpLinks title="From the audit" links={FROM_AUDIT} />
      </div>
      <FieldsGroup />
      <DropdownsGroup />
      <SkeletonsGroup />
      <CopyGroup />
      <PillsGroup />
      <BannersGroup />
      <LivePriceGroup />
      <ProseGroup />
      <TogglesGroup />
      <ProgressGroup />
      <LabelsGroup />
      <StatusGroup />
      <TablesGroup />
    </div>
  );
}
