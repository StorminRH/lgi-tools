'use client';

import { NavRailFrame, NavRailTree, navRailLink } from '@/components/ui/nav-rail';
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

/**
 * The rendered reference for every shared component in src/components/ui.
 * The `ui-reference/listed` lint rule fails when a primitive the app uses is
 * missing from this directory, so a new primitive lands with its specimen.
 */
export function PrimitivesDemo() {
  return (
    <div className="grid items-start gap-5 pb-16 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10">
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
      <div className="flex min-w-0 flex-col gap-14">
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
      </div>
    </div>
  );
}
