'use client';

import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { formatUtcTime } from '@/lib/format/time';
import { emptyDataText, syncErrorMeta } from './live-character-sync';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

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

export interface CharacterCardContent {
  isEmpty: boolean;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  rows: ReactNode;
}
