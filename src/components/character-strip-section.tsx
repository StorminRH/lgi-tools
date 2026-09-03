'use client';

import type { ReactNode } from 'react';
import { CharacterStrip } from '@/components/character-strip';
import { deriveStripView, stripPreferenceBinding } from '@/components/character-strip-view';
import type { PanelCharacter } from '@/components/live-character-card';
import { usePreference } from '@/components/PreferencesProvider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

export function CharacterStripSection({
  characters,
  strip,
  initialDimmed,
  loading,
  children,
}: {
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
  loading: boolean;
  children: (visible: PanelCharacter[]) => ReactNode;
}) {
  const binding = stripPreferenceBinding(strip, initialDimmed);
  const [dimmedIds, setDimmedIds] = usePreference(binding.def, {
    serverValue: binding.serverValue,
  });
  const view = deriveStripView(strip, characters, dimmedIds, loading);

  return (
    <>
      {view.hasStrip && (
        <CharacterStrip characters={characters} dimmedIds={dimmedIds} onChange={setDimmedIds} />
      )}
      <div className="flex items-center">
        {loading ? (
          <LoadingLabel label={view.syncCaption} />
        ) : (
          <span className="text-label tracking-wide uppercase text-muted">{view.syncCaption}</span>
        )}
      </div>
      {view.showEmptyNotice && (
        <Card>
          <EmptyState>
            Every character is hidden here — tap a portrait above to show one.
          </EmptyState>
        </Card>
      )}
      {children(view.visible)}
    </>
  );
}
