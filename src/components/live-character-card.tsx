'use client';

import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
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
  loading,
  sectionLabel,
  scopePhrase,
  noun,
  subtitle,
  headerRight,
  emptyRowsText,
  reconnectAction,
  reconnectReason,
  className,
  children,
}: {
  character: PanelCharacter;
  syncError: string | null | undefined;
  lastSyncedAt: number | null | undefined;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  sectionLabel: string;
  scopePhrase: string;
  noun: string;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  emptyRowsText: string;
  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;
  className?: string;
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
      loading={loading}
    >
      {children}
    </LiveCharacterCardBody>
  );

  return (
    <Card className={className}>
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
              <a href="/settings/characters" className="underline text-name">
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
  loading,
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
  loading: boolean;
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

      <CardRows
        needsReconnect={character.needsReconnect}
        hasData={hasData}
        isEmpty={isEmpty}
        loading={loading}
        noun={noun}
        emptyRowsText={emptyRowsText}
      >
        {children}
      </CardRows>
    </>
  );
}

/** The rows, or what stands in for them before there are any to show. */
function CardRows({
  needsReconnect,
  hasData,
  isEmpty,
  loading,
  noun,
  emptyRowsText,
  children,
}: {
  needsReconnect: boolean;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  noun: string;
  emptyRowsText: string;
  children?: ReactNode;
}) {
  if (hasData) return isEmpty ? <EmptyState>{emptyRowsText}</EmptyState> : children;
  if (loading && !needsReconnect) return <RowsSkeleton label={`Loading ${noun}`} />;
  return <EmptyState>{emptyDataText(needsReconnect)}</EmptyState>;
}

/** Two placeholder rows in the shape of a job row: icon, name, time, progress. */
function RowsSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
          <div className="flex items-center gap-2.5">
            {/* The first placeholder announces the load; the rest are decoration. */}
            <Skeleton
              label={label}
              aria-hidden={row === 0 ? undefined : true}
              className="size-5.5 rounded-ctl"
            />
            <Skeleton aria-hidden className="h-3 w-48 max-w-[50%]" />
            <Skeleton aria-hidden className="ml-auto h-3 w-24" />
          </div>
          <Skeleton aria-hidden className="h-1 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export interface CharacterCardContent {
  isEmpty: boolean;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  rows: ReactNode;
}
