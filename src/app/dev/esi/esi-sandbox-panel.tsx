'use client';

// The /dev/esi client island (3.4.6). One section per newly-scoped endpoint,
// each reading on demand through POST /api/dev/esi and rendering the outcome
// raw — pretty-printed body text plus the cache/rate headers as ESI sent them.
// A repeat read replays the held ETag as If-None-Match so the 304 path is
// visible. State is per-character component state; nothing persists.

import { useState } from 'react';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { apiFetch } from '@/lib/api-client';
import {
  DEV_ESI_ENDPOINT_IDS,
  DEV_ESI_ENDPOINTS,
  devEsiReadEndpoint,
  type DevEsiEndpointId,
  type DevEsiHeaderMeta,
  type DevEsiReadResponse,
} from './api-contract';

export interface SandboxCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  missingScopes: string[];
  hasRefreshToken: boolean;
}

type ReadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; result: DevEsiReadResponse };

// Sections render every endpoint except the planet drill-in, which lives
// inside the Planets section keyed by planet id.
const SECTION_IDS = DEV_ESI_ENDPOINT_IDS.filter((id) => id !== 'planet_detail');

const BUTTON_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-text transition-colors whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none';

function prettyBody(bodyText: string): string {
  if (bodyText === '') return '';
  try {
    return JSON.stringify(JSON.parse(bodyText), null, 2);
  } catch {
    return bodyText;
  }
}

function statusTone(status: number): 'green' | 'blue' | 'red' {
  if (status === 304) return 'blue';
  return status < 400 ? 'green' : 'red';
}

const HEADER_LABELS: Record<keyof DevEsiHeaderMeta, string> = {
  etag: 'ETag',
  expires: 'Expires',
  cacheControl: 'Cache-Control',
  contentType: 'Content-Type',
  rateLimitGroup: 'X-Ratelimit-Group',
  rateLimitLimit: 'X-Ratelimit-Limit',
  rateLimitRemaining: 'X-Ratelimit-Remaining',
  rateLimitUsed: 'X-Ratelimit-Used',
  errorLimitRemain: 'X-ESI-Error-Limit-Remain',
  errorLimitReset: 'X-ESI-Error-Limit-Reset',
  retryAfter: 'Retry-After',
};

function HeaderTable({ headers }: { headers: DevEsiHeaderMeta }) {
  const entries = (Object.keys(HEADER_LABELS) as (keyof DevEsiHeaderMeta)[]).filter(
    (key) => headers[key] !== null,
  );
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-px text-[10px] font-mono">
      {entries.map((key) => (
        <div key={key} className="contents">
          <dt className="text-muted whitespace-nowrap">{HEADER_LABELS[key]}</dt>
          <dd className="text-text break-all">{headers[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResultBlock({ state }: { state: ReadState }) {
  if (state.phase === 'idle') return null;
  if (state.phase === 'loading') {
    return <p className="text-[10px] text-muted uppercase tracking-[0.12em]">Reading…</p>;
  }
  if (state.phase === 'failed') {
    return <Callout label="Request failed">{state.message}</Callout>;
  }

  const { result } = state;
  if (result.kind === 'token_error') {
    return (
      <Callout label="Token">
        {result.error === 'reauth_required'
          ? 'reauth_required — this character needs a re-link on /characters to grant the new scopes.'
          : `${result.error} — the token service could not vend an access token.`}
      </Callout>
    );
  }
  if (result.kind === 'budget_exhausted') {
    return (
      <Callout label="Gate refused">
        {`${result.reason} (remaining ${result.remaining}) — the shared ESI budget gate did not dispatch.`}
      </Callout>
    );
  }
  if (result.kind === 'server_error') {
    return <Callout label="ESI 5xx">{`ESI answered ${result.status} (EsiServerError).`}</Callout>;
  }

  const body = prettyBody(result.bodyText);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone={statusTone(result.status)}>{result.status}</Chip>
        <Pill tone="neutral">{result.elapsedMs} ms</Pill>
        {result.status === 304 ? (
          <span className="text-[10px] text-muted">
            Not Modified — empty body, the supplied ETag still matches.
          </span>
        ) : null}
      </div>
      <HeaderTable headers={result.headers} />
      {body !== '' ? (
        <pre className="text-[10px] font-mono text-text bg-section border border-border-soft rounded-[2px] p-2.5 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">
          {body}
        </pre>
      ) : null}
    </div>
  );
}

export function EsiSandboxPanel({ characters }: { characters: SandboxCharacter[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(
    characters[0]?.characterId ?? null,
  );
  // Keyed by endpoint id, or `planet_detail:<planetId>` for drill-ins.
  const [reads, setReads] = useState<Record<string, ReadState>>({});

  const selected = characters.find((c) => c.characterId === selectedId) ?? null;

  function setRead(key: string, state: ReadState) {
    setReads((prev) => ({ ...prev, [key]: state }));
  }

  async function read(key: string, endpoint: DevEsiEndpointId, options?: {
    planetId?: number;
    ifNoneMatch?: string;
  }) {
    if (!selected) return;
    setRead(key, { phase: 'loading' });
    try {
      const result = await apiFetch(devEsiReadEndpoint, {
        body: {
          characterId: selected.characterId,
          endpoint,
          ...(options?.planetId !== undefined ? { planetId: options.planetId } : {}),
          ...(options?.ifNoneMatch ? { ifNoneMatch: options.ifNoneMatch } : {}),
        },
      });
      if (!result.ok) {
        setRead(key, {
          phase: 'failed',
          message: `HTTP ${result.status} from /api/dev/esi (${await result.response.text()})`,
        });
        return;
      }
      setRead(key, { phase: 'done', result: result.data });
    } catch {
      setRead(key, { phase: 'failed', message: 'Network error — the read did not complete.' });
    }
  }

  function heldEtag(key: string): string | null {
    const state = reads[key];
    if (state?.phase !== 'done' || state.result.kind !== 'esi') return null;
    return state.result.headers.etag;
  }

  // Planet ids parsed from the last successful planets-list read, for the
  // drill-in controls. Raw parse of the raw body — deliberately no schema.
  function planetIds(): number[] {
    const state = reads['planets'];
    if (state?.phase !== 'done' || state.result.kind !== 'esi' || state.result.status !== 200) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(state.result.bodyText);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((p: unknown) =>
          typeof p === 'object' && p !== null && 'planet_id' in p ? Number(p.planet_id) : NaN,
        )
        .filter((id) => Number.isFinite(id));
    } catch {
      return [];
    }
  }

  if (characters.length === 0) {
    return (
      <Card className="w-full max-w-[900px]">
        <EmptyState>No characters linked to this account — link one on /characters first.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[900px] flex flex-col gap-6">
      <Card>
        <SectionHeader size="md" label="Character" hint={`${characters.length} linked`} />
        <div className="flex flex-wrap gap-2 px-3.5 py-3">
          {characters.map((c) => (
            <button
              key={c.characterId}
              type="button"
              onClick={() => {
                setSelectedId(c.characterId);
                setReads({});
              }}
              className={`flex items-center gap-2 px-2 py-1.5 border transition-colors ${
                c.characterId === selectedId
                  ? 'border-border-active bg-section'
                  : 'border-border-idle hover:border-border-active'
              }`}
            >
              <img
                src={c.portraitUrl}
                alt={c.name}
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
                className="rounded-[2px] border border-border-idle"
              />
              <span className="font-mono text-[11px] text-name">{c.name}</span>
              <Pill tone="neutral">ID {c.characterId}</Pill>
              {!c.hasRefreshToken ? (
                <Chip tone="red">Disconnected</Chip>
              ) : c.missingScopes.length > 0 ? (
                <Chip tone="orange">{`Needs re-auth (${c.missingScopes.length} scopes)`}</Chip>
              ) : (
                <Chip tone="green">Full grant</Chip>
              )}
            </button>
          ))}
        </div>
        {selected && selected.missingScopes.length > 0 ? (
          <Callout label="Heads up">
            This character has not granted the 3.4.6 superset yet — scoped reads
            will come back 403 from ESI until it re-links on /characters. That
            raw 403 is itself a valid sandbox observation.
          </Callout>
        ) : null}
      </Card>

      {SECTION_IDS.map((id) => {
        const config = DEV_ESI_ENDPOINTS[id];
        const etag = heldEtag(id);
        return (
          <Card key={id}>
            <SectionHeader
              size="md"
              label={config.label}
              hint={<span className="normal-case">{config.scope}</span>}
            />
            <div className="flex flex-col gap-3 px-3.5 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tone="neutral" className="normal-case">
                  GET {config.pathTemplate.replace('{characterId}', String(selected?.characterId ?? '…'))}
                </Pill>
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={!selected || reads[id]?.phase === 'loading'}
                  onClick={() => void read(id, id)}
                >
                  Read
                </button>
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={!selected || etag === null || reads[id]?.phase === 'loading'}
                  onClick={() => void read(id, id, { ifNoneMatch: etag ?? undefined })}
                >
                  Re-read (If-None-Match)
                </button>
              </div>
              <ResultBlock state={reads[id] ?? { phase: 'idle' }} />

              {id === 'planets'
                ? planetIds().map((planetId) => {
                    const key = `planet_detail:${planetId}`;
                    const detailEtag = heldEtag(key);
                    return (
                      <div
                        key={planetId}
                        className="flex flex-col gap-2 border-l-2 border-border-soft pl-3"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill tone="neutral" className="normal-case">{`planet ${planetId}`}</Pill>
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            disabled={reads[key]?.phase === 'loading'}
                            onClick={() => void read(key, 'planet_detail', { planetId })}
                          >
                            Read detail
                          </button>
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            disabled={detailEtag === null || reads[key]?.phase === 'loading'}
                            onClick={() =>
                              void read(key, 'planet_detail', {
                                planetId,
                                ifNoneMatch: detailEtag ?? undefined,
                              })
                            }
                          >
                            Re-read (If-None-Match)
                          </button>
                        </div>
                        <ResultBlock state={reads[key] ?? { phase: 'idle' }} />
                      </div>
                    );
                  })
                : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
