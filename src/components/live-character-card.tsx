'use client';

// Presentational chrome for the per-character panels (skill queue, industry jobs).
// The Convex-reactive plumbing that once lived here — the session gate, the
// engine-coupled sync/clock/name hook, and the per-tracker COLD/HOT merge hooks —
// left with the trackers as each moved to a Neon stale-gated on-view read
// (MIGRATE.B.1/B.2/B.3), and the onlineStatus canary retired with the portrait
// dot (Convex now activates only on Atlas surfaces). What remains is the
// pure card shell each feature feeds with already-resolved data + its own render
// clock. This is the `shared` zone (`src/components/*.tsx`), the only layer permitted
// to import features + data + ui + lib, so the two features compose it without
// importing each other.
import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { formatUtcTime } from '@/lib/format/time';
import { emptyDataText, syncErrorMeta } from './live-character-sync';

/**
 * Server-prop shape for one linked character: Neon truth (name/portrait/scope
 * health) joined client-side with the live projection.
 */
export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

/**
 * The card shell for one character: portrait header (with feature-supplied
 * subtitle + header-right slot), the reconnect and sync-error callouts, the
 * "as of" section header, and the null / empty / rows tri-state. Rows are the
 * children; everything that differs per feature arrives as a prop.
 */
export function LiveCharacterCard({
  character,
  syncError,
  lastSyncedAt,
  hasData,
  isEmpty,
  syncing,
  sectionLabel,
  scopePhrase,
  noun,
  subtitle,
  headerRight,
  emptyRowsText,
  reconnectAction,
  reconnectReason,
  children,
}: {
  character: PanelCharacter;
  syncError: string | null | undefined;
  lastSyncedAt: number | null | undefined;
  hasData: boolean;
  isEmpty: boolean;
  syncing: boolean;
  sectionLabel: string;
  scopePhrase: string;
  noun: string;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  emptyRowsText: string;
  // Opt-in per-character scope gate: when a panel supplies an in-place grant
  // control (and its reason), a character that needs reconnecting blocks its own
  // card behind that grant instead of the "reconnect on the Characters page"
  // link. Panels that pass neither keep the link affordance unchanged.
  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;
  children?: ReactNode;
}) {
  const grantedContent = (
    <LiveCharacterCardBody
      character={character}
      emptyRowsText={emptyRowsText}
      hasData={hasData}
      isEmpty={isEmpty}
      lastSyncedAt={lastSyncedAt}
      noun={noun}
      sectionLabel={sectionLabel}
      syncError={syncError}
      syncing={syncing}
    >
      {children}
    </LiveCharacterCardBody>
  );

  return (
    <Card>
      <LiveCharacterCardHeader
        character={character}
        headerRight={headerRight}
        subtitle={subtitle}
      />

      {reconnectAction !== undefined ? (
        <AccessGate
          blocked={character.needsReconnect}
          reason={reconnectReason}
          action={reconnectAction}
          className="m-3.5"
        >
          {grantedContent}
        </AccessGate>
      ) : (
        <>
          {character.needsReconnect && (
            <Callout className="mx-3.5 my-2" label="Reconnect">
              This character is missing {scopePhrase} —{' '}
              <a href="/characters" className="underline text-name">
                reconnect it on the Characters page
              </a>{' '}
              to sync its {noun}.
            </Callout>
          )}
          {grantedContent}
        </>
      )}
    </Card>
  );
}

function LiveCharacterCardHeader({
  character,
  headerRight,
  subtitle,
}: {
  character: PanelCharacter;
  headerRight?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border-soft">
      <CharacterPortrait
        characterId={character.characterId}
        name={character.name}
        size={36}
        src={character.portraitUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-h3 text-name truncate">
          {character.name}
        </div>
        {subtitle}
      </div>
      {headerRight}
    </div>
  );
}

function LiveCharacterCardBody({
  character,
  children,
  emptyRowsText,
  hasData,
  isEmpty,
  lastSyncedAt,
  noun,
  sectionLabel,
  syncError,
  syncing,
}: {
  character: PanelCharacter;
  children?: ReactNode;
  emptyRowsText: string;
  hasData: boolean;
  isEmpty: boolean;
  lastSyncedAt: number | null | undefined;
  noun: string;
  sectionLabel: string;
  syncError: string | null | undefined;
  syncing: boolean;
}) {
  return (
    <>
      {!character.needsReconnect && syncError != null && (
        <Callout className="mx-3.5 my-2" label={syncErrorMeta(syncError).label}>
          {hasData && lastSyncedAt != null
            ? `Couldn't refresh — showing data as of ${formatUtcTime(lastSyncedAt)}.`
            : `Couldn't fetch this character's ${noun} yet.`}
        </Callout>
      )}

      <SectionHeader
        label={sectionLabel}
        hint={
          hasData && lastSyncedAt != null
            ? `as of ${formatUtcTime(lastSyncedAt)}`
            : undefined
        }
      />

      {!hasData ? (
        <EmptyState>{emptyDataText(character.needsReconnect, syncing)}</EmptyState>
      ) : isEmpty ? (
        <EmptyState>{emptyRowsText}</EmptyState>
      ) : (
        children
      )}
    </>
  );
}

/**
 * What a feature renders for one character once its live doc is in hand. The
 * panel owns the LiveCharacterCard shell; the feature supplies only what differs
 * per character — the empty test, the two header slots, and the rows.
 */
export interface CharacterCardContent {
  isEmpty: boolean;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  rows: ReactNode;
}
