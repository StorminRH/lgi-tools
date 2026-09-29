'use client';

import { useCallback, useRef } from 'react';
import { blueprintRefOf, blueprintsSource } from './blueprints-source';
import type { RecentBlueprint } from './recent-blueprints';

export type BlueprintParams = { blueprint: RecentBlueprint };
export type BlueprintErr = { kind: 'not_found' };

/**
 * The blueprint index behind a terminal search box: suggestions come from the
 * same ranked index as the header search, and a submitted name resolves to
 * the blueprint it was suggested for.
 */
export function useBlueprintSearch(): {
  parse: (input: string) => { ok: true; params: BlueprintParams } | { ok: false; error: BlueprintErr };
  suggest: (input: string) => Promise<string[]>;
} {
  const suggested = useRef(new Map<string, RecentBlueprint>());
  const ctrlRef = useRef<AbortController | null>(null);

  const suggest = useCallback(async (input: string): Promise<string[]> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const results = await blueprintsSource.search(input.trim(), {
      session: null,
      isAdmin: false,
      recents: [],
      signal: ctrl.signal,
    });
    const labels: string[] = [];
    for (const result of results) {
      const ref = blueprintRefOf(result);
      if (ref === null) continue;
      suggested.current.set(result.label.toLowerCase(), ref);
      labels.push(result.label);
    }
    return labels;
  }, []);

  const parse = useCallback((input: string) => {
    const blueprint = suggested.current.get(input.trim().toLowerCase());
    return blueprint
      ? { ok: true as const, params: { blueprint } }
      : { ok: false as const, error: { kind: 'not_found' as const } };
  }, []);

  return { parse, suggest };
}
