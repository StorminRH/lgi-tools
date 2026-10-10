'use client';

import { NavRailFrame, NavRailLayout, NavRailTree, navRailLink } from '@/components/ui/nav-rail';
import { ActionsGroup } from './actions';
import { ChoicesGroup } from './choices';
import { DataGroup } from './data';
import { FeedbackGroup } from './feedback';
import { FormsGroup } from './forms';
import { NavigationGroup } from './navigation';
import { OverlaysGroup } from './overlays';
import { ProseGroup } from './prose';
import type { ReferenceGroupId } from './specimen';
import { StructureGroup } from './structure';
import { TagsGroup } from './tags';

const CONTENTS: readonly { id: ReferenceGroupId; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'forms', label: 'Forms' },
  { id: 'choices', label: 'Choices' },
  { id: 'tags', label: 'Tags & status' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'structure', label: 'Structure' },
  { id: 'data', label: 'Data' },
  { id: 'prose', label: 'Prose' },
];

export function PrimitivesDemo() {
  return (
    <NavRailLayout
      className="pb-16"
      rail={
        <NavRailFrame title="Contents" label="Jump to" current="All primitives">
          <NavRailTree
            label="Primitive families"
            groups={[{ id: 'families', label: 'Families', sections: CONTENTS }]}
            renderSection={(section) => (
              <a href={`#${section.id}`} className={`${navRailLink} block`}>
                {section.label}
              </a>
            )}
          />
        </NavRailFrame>
      }
      contentClassName="flex flex-col gap-14"
    >
      <ActionsGroup />
      <FormsGroup />
      <ChoicesGroup />
      <TagsGroup />
      <FeedbackGroup />
      <OverlaysGroup />
      <NavigationGroup />
      <StructureGroup />
      <DataGroup />
      <ProseGroup />
    </NavRailLayout>
  );
}
