'use client';

// Shared chrome for the live per-character panels (skill queue, industry jobs,
// and any future tracker). Each feature owns its row renderer, summary, and
// id-extraction; everything that was byte-identical between the panels — the
// session gate, the sync/clock/name-enrichment hook, the per-character card
// shell with its reconnect/sync-error callouts and null/empty/rows tri-state,
// and the whole panel column (status line, sync-error callout, per-character
// loop) — lives here. This is the `shared` zone (`src/components/*.tsx`), the
// only layer permitted to import features + data + ui + lib, so the two features
// compose it without importing each other.
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { useLoadingToast } from '@/components/ui/loading-toast';
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

// The Convex session tri-state, content-agnostic. No deployment → `unavailable`;
// an optional pre-auth `empty` slot (rendered before the tri-state so its order
// matches a gate that short-circuits on "no characters"); otherwise the auth
// tri-state — `loading` while the session resolves, `signedOut` with no session,
// `children` once authenticated. Each consumer supplies its own chrome (the
// Card-framed gate below, the `// Active jobs` section on /industry), so the
// shell owns only the branch logic both share.
export function LiveSessionShell({
  unavailable,
  empty,
  loading,
  signedOut,
  children,
}: {
  unavailable: ReactNode;
  empty?: ReactNode;
  loading: ReactNode;
  signedOut: ReactNode;
  children: ReactNode;
}) {
  if (convexClient === null) return <>{unavailable}</>;
  if (empty != null) return <>{empty}</>;
  return (
    <>
      <AuthLoading>{loading}</AuthLoading>
      <Unauthenticated>{signedOut}</Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

// Gate the live island on build config, account state, and the Convex session:
// no deployment → unavailable; no linked characters → empty; otherwise show the
// children only once authenticated. The per-character panels (skill queue,
// industry jobs, home roster) share this Card-framed gate.
export function LiveSessionGate({
  characters,
  emptyText,
  children,
}: {
  characters: PanelCharacter[];
  emptyText: ReactNode;
  children: ReactNode;
}) {
  return (
    <LiveSessionShell
      unavailable={
        <Card>
          <Callout label="Unavailable">
            Live data is not configured on this build (no Convex deployment).
          </Callout>
        </Card>
      }
      empty={
        characters.length === 0 ? (
          <Card>
            <EmptyState>{emptyText}</EmptyState>
          </Card>
        ) : undefined
      }
      loading={<LoadingLabel label="Connecting live session…" />}
      signedOut={
        <Card>
          <Callout label="Heads up">
            Live session unavailable — try reloading, or signing out and back in.
          </Callout>
        </Card>
      }
    >
      {children}
    </LiveSessionShell>
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
  // The card body once this character's access is granted: a sync-error notice
  // (only when connected), the "as of" header, and the null/empty/rows tristate.
  const grantedContent = (
    <>
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
    </>
  );

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
            <Callout label="Reconnect">
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

// The minimum a panel reads off one character's live doc: `data` presence drives
// the card's has-data/empty tri-state; the sync metadata feeds the reconnect /
// sync-error callouts. The concrete `data` shape (a queue vs a job list) stays
// with the feature — the panel only tests presence.
interface LivePanelCharacter {
  characterId: number;
  data?: unknown;
  syncError?: string | null;
  lastSyncedAt?: number | null;
}

// What a feature renders for one character once its live doc is in hand. The
// panel owns the LiveCharacterCard shell; the feature supplies only what differs
// per character — the empty test, the two header slots, and the rows.
export interface CharacterCardContent {
  isEmpty: boolean;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  rows: ReactNode;
}

// The full live-character panel: the column of per-character cards under a
// "Live · …" status line, with the sitewide loading toast and the run-error
// callout. Everything byte-identical between the skill-queue and industry-jobs
// panels lives here — the sync wiring, the toast, the status line, the error
// callout, and the LiveCharacterCard shell — so each feature is a thin config
// plus one `renderCard` seam. The card chrome (labels/scope/noun/empty copy) is
// static config; `renderCard` supplies the dynamic per-character content.
export function LiveCharacterPanel<TChar extends LivePanelCharacter>({
  live,
  characters,
  dataset,
  extractTypeIds,
  liveLabel,
  sectionLabel,
  scopePhrase,
  noun,
  emptyRowsText,
  reconnectAction,
  reconnectReason,
  renderCard,
}: {
  live:
    | {
        characters: TChar[];
        syncState?: { status?: string | null; lastError?: string | null } | null;
      }
    | null
    | undefined;
  characters: PanelCharacter[];
  dataset: SyncDataset;
  extractTypeIds: (characters: TChar[]) => number[];
  liveLabel: string;
  sectionLabel: string;
  scopePhrase: string;
  noun: string;
  emptyRowsText: string;
  // Optional per-character scope gate, forwarded to each card (see
  // LiveCharacterCard). Omitted by panels that keep the link affordance.
  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;
  renderCard: (
    live: TChar | undefined,
    names: Record<string, string>,
    now: number,
  ) => CharacterCardContent;
}) {
  const { liveByCharacter, names, now, syncing, runError } = useLiveCharacterSync({
    live,
    dataset,
    characterIds: characters.map((c) => c.characterId),
    extractTypeIds,
  });

  // Drop the sitewide loading toast while an ESI character sync is running.
  useLoadingToast(syncing);

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-6">
      <div className="flex items-center">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          {syncing ? 'Syncing from ESI…' : liveLabel}
        </span>
      </div>

      {runError !== null && (
        <Card>
          <Callout label="Sync trouble">
            {syncErrorMeta(runError.split(':')[0] ?? runError).label} — showing the last
            synced data below.
          </Callout>
        </Card>
      )}

      {characters.map((character) => {
        const liveChar = liveByCharacter.get(character.characterId);
        const { isEmpty, subtitle, headerRight, rows } = renderCard(liveChar, names, now);
        return (
          <LiveCharacterCard
            key={character.characterId}
            character={character}
            syncError={liveChar?.syncError}
            lastSyncedAt={liveChar?.lastSyncedAt}
            hasData={(liveChar?.data ?? null) !== null}
            isEmpty={isEmpty}
            syncing={syncing}
            sectionLabel={sectionLabel}
            scopePhrase={scopePhrase}
            noun={noun}
            subtitle={subtitle}
            headerRight={headerRight}
            emptyRowsText={emptyRowsText}
            reconnectAction={reconnectAction}
            reconnectReason={reconnectReason}
          >
            {rows}
          </LiveCharacterCard>
        );
      })}
    </div>
  );
}
