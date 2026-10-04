'use client';

import type { ReactNode } from 'react';
import { CharacterStrip } from '@/components/character-strip';
import { deriveStripView } from '@/components/character-strip-view';
import { usePreference } from '@/components/PreferencesProvider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionLabel } from '@/components/ui/section-label';
import { stripDimmedDef } from '@/lib/preferences';
import type { PanelCharacter } from '@/platform/auth/panel-character';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

/** A section of per-pilot cards under its heading, with the strip that hides pilots beside it. */
export function CharacterStripSection({
  heading,
  characters,
  strip,
  failure = null,
  children,
}: {
  heading: string;
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
  failure?: ReactNode;
  children: (visible: PanelCharacter[]) => ReactNode;
}) {
  // Which pilots are hidden is an account setting, read from the preferences
  // store rather than a cookie, so the strip never waits on the request.
  const [dimmedIds, setDimmedIds] = usePreference(stripDimmedDef(strip?.surfaceId));
  const view = deriveStripView(strip, characters, dimmedIds);

  return (
    <section aria-label={heading} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SectionLabel>{heading}</SectionLabel>
        {view.hasStrip && (
          <CharacterStrip characters={characters} dimmedIds={dimmedIds} onChange={setDimmedIds} />
        )}
      </div>
      {failure}
      {view.showEmptyNotice && (
        <Card>
          <EmptyState>
            Every character is hidden here — tap a portrait above to show one.
          </EmptyState>
        </Card>
      )}
      {children(view.visible)}
    </section>
  );
}
