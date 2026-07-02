'use client';

// The tracker panels' shared participation chrome (ACCOUNT.7): the character
// strip, the sync-status caption, the all-hidden notice, and the view-only
// render filter, behind one seam. Both tracker features (skill queue, industry
// jobs) compose it — the real second consumer that earns the primitive — so the
// strip cluster lives once instead of template-cloning across the panels.
//
// One usePreference binding drives the strip AND the filter. Without a strip
// declaration the sentinel def reads as [] and nothing strip-related renders —
// children receive the untouched character list (today's render exactly). The
// sync ids are NOT derived here on purpose: panels compute them from the full
// list (character-strip-model's syncEligibleIds) before this filter exists in
// the tree, so dimming provably never touches the fetch.

import type { ReactNode } from 'react';
import { CharacterStrip } from '@/components/character-strip';
import { visibleCharacters } from '@/components/character-strip-model';
import type { PanelCharacter } from '@/components/live-character-card';
import { usePreference } from '@/components/PreferencesProvider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { stripDimmedDef } from '@/lib/preferences';
import type { CharacterStripSpec } from '@/page-settings/types';

export function CharacterStripSection({
  characters,
  strip,
  initialDimmed,
  loading,
  children,
}: {
  characters: PanelCharacter[];
  // The page's spec.strip declaration (D-7 opt-in) + the cookie-read dimmed set
  // for the first paint. Absent = no strip, no filtering.
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
  loading: boolean;
  children: (visible: PanelCharacter[]) => ReactNode;
}) {
  const [dimmedIds, setDimmedIds] = usePreference(stripDimmedDef(strip?.surfaceId), {
    serverValue: strip !== undefined ? initialDimmed : undefined,
  });
  const visible = strip !== undefined ? visibleCharacters(characters, dimmedIds) : characters;

  return (
    <>
      {strip !== undefined && (
        <CharacterStrip characters={characters} dimmedIds={dimmedIds} onChange={setDimmedIds} />
      )}
      <div className="flex items-center">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          {loading ? 'Loading…' : 'Synced from ESI on view'}
        </span>
      </div>
      {strip !== undefined && visible.length === 0 && (
        <Card>
          <EmptyState>
            Every character is hidden here — tap a portrait above to show one.
          </EmptyState>
        </Card>
      )}
      {children(visible)}
    </>
  );
}
