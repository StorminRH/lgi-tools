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
import { deriveStripView, stripPreferenceBinding } from '@/components/character-strip-view';
import type { PanelCharacter } from '@/components/live-character-card';
import { usePreference } from '@/components/PreferencesProvider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { CharacterStripSpec } from '@/page-settings/types';

/**
 * Connects a page-settings character-strip declaration to roster and online state, then renders
 * its loading, empty, or populated section.
 */
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
        <span className="text-label tracking-wide uppercase text-muted">
          {view.syncCaption}
        </span>
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
