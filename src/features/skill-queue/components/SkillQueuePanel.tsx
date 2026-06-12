'use client';

// The skill-queue island (3.4.7). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at
// render time) and joins them with the live Convex projection: useQuery
// streams every sync write over the websocket, so a queue updates with no
// reload and no client polling. Mounting (and the manual button) records sync
// intent via the requestSync mutation — the client never calls the action,
// and the ids it sends are a freshness hint only.
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState } from 'react';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';
import { typeNamesEndpoint, TYPE_NAMES_MAX_IDS } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/lib/api-client';
import { formatQuantity, formatRemaining } from '@/lib/format';
import type { SkillQueueEntry } from '../esi-projection';
import { entryProgress, romanLevel, summarizeQueue } from '../progress';
import { STATUS_META, syncErrorMeta } from '../skill-queue-styles';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

export function SkillQueuePanel({ characters }: { characters: PanelCharacter[] }) {
  if (convexClient === null) {
    return (
      <Card>
        <Callout label="Unavailable">
          Live data is not configured on this build (no Convex deployment).
        </Callout>
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
      <Authenticated>
        <LiveQueues characters={characters} />
      </Authenticated>
    </>
  );
}

// Re-render cadence for the client-side timestamp math — progress bars and
// "finishes in" labels stay honest without any data traffic.
const TICK_MS = 30_000;

function LiveQueues({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.skills.forViewer);
  const requestSync = useMutation(api.skills.requestSync);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // On-view sync: rendered only inside <Authenticated>, so Convex auth is
  // established before this fires. The mutation itself decides whether a run
  // is actually warranted (freshness gate, in-flight dedupe).
  const characterIdsKey = characters.map((c) => c.characterId).join(',');
  useEffect(() => {
    if (characterIdsKey === '') return;
    void requestSync({
      characterIdsHint: characterIdsKey.split(',').map(Number),
    });
  }, [characterIdsKey, requestSync]);

  // SDE name enrichment, client-side: resolve the skill ids present in the
  // live docs against Neon. Names never live in Convex.
  const skillIds = useMemo(() => {
    const ids = new Set<number>();
    for (const character of live?.characters ?? []) {
      for (const entry of character.data?.entries ?? []) ids.add(entry.skill_id);
    }
    return [...ids].sort((a, b) => a - b).slice(0, TYPE_NAMES_MAX_IDS);
  }, [live]);
  const [names, setNames] = useState<Record<string, string>>({});
  const skillIdsKey = skillIds.join(',');
  useEffect(() => {
    if (skillIdsKey === '') return;
    let cancelled = false;
    void apiFetch(typeNamesEndpoint, {
      body: { typeIds: skillIdsKey.split(',').map(Number) },
    }).then((result) => {
      if (!cancelled && result.ok) setNames((prev) => ({ ...prev, ...result.data.names }));
    });
    return () => {
      cancelled = true;
    };
  }, [skillIdsKey]);

  const liveByCharacter = new Map(
    (live?.characters ?? []).map((character) => [character.characterId, character]),
  );
  const syncing = live?.syncState?.status === 'running';
  const runError = live?.syncState?.lastError ?? null;

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          {syncing ? 'Syncing from ESI…' : 'Live · updates as syncs land'}
        </span>
        <button
          type="button"
          onClick={() =>
            void requestSync({ characterIdsHint: characters.map((c) => c.characterId) })
          }
          disabled={syncing}
          className="font-mono text-[10px] tracking-[0.1em] uppercase border border-border rounded-[2px] px-3 py-1.5 text-name hover:bg-surface-raised cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {runError !== null && (
        <Card>
          <Callout label="Sync trouble">
            {syncErrorMeta(runError.split(':')[0] ?? runError).label} — showing the last
            synced data below.
          </Callout>
        </Card>
      )}

      {characters.map((character) => (
        <CharacterQueueCard
          key={character.characterId}
          character={character}
          live={liveByCharacter.get(character.characterId)}
          names={names}
          now={now}
          syncing={syncing}
        />
      ))}
    </div>
  );
}

type LiveCharacter = NonNullable<
  FunctionReturnType<typeof api.skills.forViewer>
>['characters'][number];

function CharacterQueueCard({
  character,
  live,
  names,
  now,
  syncing,
}: {
  character: PanelCharacter;
  live: LiveCharacter | undefined;
  names: Record<string, string>;
  now: number;
  syncing: boolean;
}) {
  const data = live?.data ?? null;
  const summary = data !== null ? summarizeQueue(data.entries, now) : null;

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
          {data !== null && (
            <div className="text-[10px] text-muted tracking-[0.06em]">
              {formatQuantity(data.totalSp)} SP
              {data.unallocatedSp !== undefined && data.unallocatedSp > 0
                ? ` · ${formatQuantity(data.unallocatedSp)} unallocated`
                : ''}
            </div>
          )}
        </div>
        {summary !== null && summary.kind === 'active' && summary.finishesAt !== null && (
          <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
            queue ends in {formatRemaining(summary.finishesAt - now)}
          </span>
        )}
        {summary !== null && summary.kind === 'paused' && <Pill tone="orange">Paused</Pill>}
      </div>

      {character.needsReconnect && (
        <Callout label="Reconnect">
          This character is missing the skill scopes —{' '}
          <a href="/characters" className="underline text-name">
            reconnect it on the Characters page
          </a>{' '}
          to sync its queue.
        </Callout>
      )}

      {!character.needsReconnect && live?.syncError != null && (
        <Callout label={syncErrorMeta(live.syncError).label}>
          {data !== null && live.lastSyncedAt !== null
            ? `Couldn't refresh — showing data as of ${new Date(live.lastSyncedAt).toLocaleTimeString()}.`
            : "Couldn't fetch this character's queue yet."}
        </Callout>
      )}

      <SectionHeader
        label="Skill queue"
        hint={
          data !== null && live?.lastSyncedAt != null
            ? `as of ${new Date(live.lastSyncedAt).toLocaleTimeString()}`
            : undefined
        }
      />

      {data === null ? (
        <EmptyState>
          {character.needsReconnect
            ? 'Nothing synced for this character.'
            : syncing
              ? 'Syncing…'
              : 'Awaiting first sync.'}
        </EmptyState>
      ) : data.entries.length === 0 ? (
        <EmptyState>No skills in the training queue.</EmptyState>
      ) : (
        data.entries.map((entry) => (
          <QueueEntryRow
            key={entry.queue_position}
            entry={entry}
            name={names[String(entry.skill_id)]}
            now={now}
          />
        ))
      )}
    </Card>
  );
}

function QueueEntryRow({
  entry,
  name,
  now,
}: {
  entry: SkillQueueEntry;
  name: string | undefined;
  now: number;
}) {
  const progress = entryProgress(entry, now);
  const meta = STATUS_META[progress.status];
  const finish = entry.finish_date !== undefined ? Date.parse(entry.finish_date) : null;

  return (
    <div className="border-t border-border-soft px-3.5 py-[6px]">
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto_auto] items-center gap-[6px] text-[12px]">
        <span className="text-[10px] text-muted">{entry.queue_position + 1}</span>
        <span className="text-name truncate leading-[1.5]">
          {name ?? `Skill #${entry.skill_id}`}{' '}
          <span className="text-muted">{romanLevel(entry.finished_level)}</span>
        </span>
        <span className="text-[10px] text-muted shrink-0">
          {progress.status === 'training' && finish !== null
            ? formatRemaining(finish - now)
            : ''}
        </span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {progress.status === 'training' && (
        <div className="mt-[4px]">
          <ProgressBar pct={progress.pct} />
        </div>
      )}
    </div>
  );
}
