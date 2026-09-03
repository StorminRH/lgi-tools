import { PREFERENCES, reconcilePreferences } from '@/lib/preferences';
import type { GetPreferencesResponse } from './api-contract';

export function parseServerPreferences(
  preferences: GetPreferencesResponse['preferences'],
): Map<string, unknown> {
  const serverValues = new Map<string, unknown>();
  for (const def of PREFERENCES) {
    const entry = preferences.find((p) => p.key === def.key);
    if (!entry) continue;
    const parsed = def.schema.safeParse(entry.value);
    if (parsed.success) serverValues.set(def.key, parsed.data);
  }
  return serverValues;
}

export function processPreferencesResponse(
  res: { ok: true; data: GetPreferencesResponse } | { ok: false },
  localValues: Map<string, unknown>,
): { reconciled: Map<string, unknown>; toSeed: string[] } {
  const serverValues = res.ok
    ? parseServerPreferences(res.data.preferences)
    : new Map<string, unknown>();
  const { values, toSeed } = reconcilePreferences(serverValues, localValues);
  return { reconciled: values, toSeed: res.ok ? toSeed : [] };
}
