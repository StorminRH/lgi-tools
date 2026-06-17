'use client';

// Shared chrome for the live per-character panels (skill queue, industry jobs,
// and any future tracker). Each feature owns its row renderer, summary, and
// id-extraction; everything that was byte-identical between the panels — the
// session gate, the sync/clock/name-enrichment hook, and the card shell with
// its reconnect/sync-error callouts and null/empty/rows tri-state — lives here.
// This is the `shared` zone (`src/components/*.tsx`), the only layer permitted
// to import features + data + ui + lib, so the two features compose it without
// importing each other.
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { convexClient } from '@/data/convex/client';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { TYPE_NAMES_MAX_IDS, typeNamesEndpoint } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/lib/api-client';
import type { SyncDataset } from '@/lib/sync-engine';
import { emptyDataText, syncErrorMeta } from './live-character-sync';

// Server-prop shape for one linked character: Neon truth (name/portrait/scope
// health) joined client-side with the live Convex projection.
export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

// Gate the live island on build config, account state, and the Convex session:
// no deployment → unavailable; no linked characters → empty; otherwise show the
// children only once authenticated.
export function LiveSessionGate({
  characters,
  emptyText,
  children,
}: {
  characters: PanelCharacter[];
  emptyText: ReactNode;
  children: ReactNode;
}) {
  if (convexClient === null) {
    return (
      <Card>
        <Callout label="Unavailable">
          Live data is not configured on this build (no Convex deployment).
        </Callout>
      </Card>
    );
  }
  if (characters.length === 0) {
    return (
      <Card>
        <EmptyState>{emptyText}</EmptyState>
      </Card>
    );
  }
  return (
    <>
      <AuthLoading>
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          Connecting live session…
        </span>
      </AuthLoading>
      <Unauthenticated>
        <Card>
          <Callout label="Heads up">
            Live session unavailable — try reloading, or signing out and back in.
          </Callout>
        </Card>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

// Re-render cadence for the client-side timestamp math — progress bars and
// "done in" labels stay honest without any data traffic.
const TICK_MS = 30_000;

// The live join shared by every per-character panel: heartbeat the subject,
// tick a render clock, and resolve the type ids present in the live docs to
// names (names never live in Convex). `extractTypeIds` is the one per-feature
// seam — it gathers the ids that feature cares about; dedupe/sort/cap is shared.
export function useLiveCharacterSync<TChar extends { characterId: number }>({
  live,
  dataset,
  characterIds,
  extractTypeIds,
}: {
  live:
    | {
        characters: TChar[];
        syncState?: { status?: string | null; lastError?: string | null } | null;
      }
    | null
    | undefined;
  dataset: SyncDataset;
  characterIds: number[];
  extractTypeIds: (characters: TChar[]) => number[];
}): {
  liveByCharacter: Map<number, TChar>;
  names: Record<string, string>;
  now: number;
  syncing: boolean;
  runError: string | null;
} {
  // Presence + on-view sync: rendered only inside <Authenticated>, so Convex
  // auth is established before the first heartbeat. The engine decides whether a
  // run is warranted and keeps the subject refreshing while the tab is visible.
  useSyncSubject(dataset, characterIds);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const typeIds = useMemo(
    () =>
      [...new Set(extractTypeIds(live?.characters ?? []))]
        .sort((a, b) => a - b)
        .slice(0, TYPE_NAMES_MAX_IDS),
    [live, extractTypeIds],
  );
  const [names, setNames] = useState<Record<string, string>>({});
  const typeIdsKey = typeIds.join(',');
  useEffect(() => {
    if (typeIdsKey === '') return;
    let cancelled = false;
    void apiFetch(typeNamesEndpoint, {
      body: { typeIds: typeIdsKey.split(',').map(Number) },
    }).then((result) => {
      if (!cancelled && result.ok) setNames((prev) => ({ ...prev, ...result.data.names }));
    });
    return () => {
      cancelled = true;
    };
  }, [typeIdsKey]);

  const liveByCharacter = new Map(
    (live?.characters ?? []).map((character) => [character.characterId, character]),
  );
  const syncing = live?.syncState?.status === 'running';
  const runError = live?.syncState?.lastError ?? null;

  return { liveByCharacter, names, now, syncing, runError };
}

// The card shell for one character: portrait header (with feature-supplied
// subtitle + header-right slot), the reconnect and sync-error callouts, the
// "as of" section header, and the null / empty / rows tri-state. Rows are the
// children; everything that differs per feature arrives as a prop.
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
  children?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border-soft">
        <img
          src={character.portraitUrl}
          alt={character.name}
          width={36}
          height={36}
          className="rounded-[2px] border border-border-idle"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[15px] text-name truncate">
            {character.name}
          </div>
          {subtitle}
        </div>
        {headerRight}
      </div>

      {character.needsReconnect && (
        <Callout label="Reconnect">
          This character is missing {scopePhrase} —{' '}
          <a href="/characters" className="underline text-name">
            reconnect it on the Characters page
          </a>{' '}
          to sync its {noun}.
        </Callout>
      )}

      {!character.needsReconnect && syncError != null && (
        <Callout label={syncErrorMeta(syncError).label}>
          {hasData && lastSyncedAt != null
            ? `Couldn't refresh — showing data as of ${new Date(lastSyncedAt).toLocaleTimeString()}.`
            : `Couldn't fetch this character's ${noun} yet.`}
        </Callout>
      )}

      <SectionHeader
        label={sectionLabel}
        hint={
          hasData && lastSyncedAt != null
            ? `as of ${new Date(lastSyncedAt).toLocaleTimeString()}`
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
    </Card>
  );
}
