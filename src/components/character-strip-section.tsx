'use client';

import type { ReactNode } from 'react';
import { CharacterStrip } from '@/components/character-strip';
import { deriveStripView } from '@/components/character-strip-view';
import type { PanelCharacter } from '@/components/live-character-card';
import { usePreference } from '@/components/PreferencesProvider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { stripDimmedDef } from '@/lib/preferences';
import type { CharacterStripSpec } from '@/platform/page-settings/types';

export function CharacterStripSection({
  characters,
  strip,
  loading,
  failure = null,
  children,
}: {
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
  loading: boolean;
  failure?: ReactNode;
  children: (visible: PanelCharacter[]) => ReactNode;
}) {
  // Which pilots are hidden is an account setting, read from the preferences
  // store rather than a cookie, so the strip never waits on the request.
  const [dimmedIds, setDimmedIds] = usePreference(stripDimmedDef(strip?.surfaceId));
  const view = deriveStripView(strip, characters, dimmedIds, loading);

  return (
    <>
      {view.hasStrip && (
        <CharacterStrip characters={characters} dimmedIds={dimmedIds} onChange={setDimmedIds} />
      )}
      {failure ?? (
        <div className="flex items-center">
          {loading ? (
            <LoadingLabel label={view.syncCaption} />
          ) : (
            <span className="text-label tracking-wide uppercase text-muted">{view.syncCaption}</span>
          )}
        </div>
      )}
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
