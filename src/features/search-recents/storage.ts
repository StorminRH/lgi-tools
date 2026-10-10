import { z } from 'zod';
import { blueprintImage, type EveImageDescriptor } from '@/data/eve-data/type-images';
import { useClientStore } from '@/lib/client-store';
import { createStoredList } from '@/lib/web-storage';
import type { SearchResult } from '@/platform/search';

const EMPTY_RECENTS: SearchResult[] = [];

const storedRecentSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  sub: z.string().optional(),
  href: z.string(),
  iconText: z.string().optional(),
  iconTone: z.string().optional(),
  typeId: z.number().optional(),
});

type StoredRecent = z.infer<typeof storedRecentSchema>;

const BLUEPRINT_KIND = 'blueprint';
const BLUEPRINT_ID_PREFIX = 'blueprint:';

function storedBlueprintTypeId(r: StoredRecent): number | undefined {
  if (r.kind !== BLUEPRINT_KIND || !r.id.startsWith(BLUEPRINT_ID_PREFIX)) return undefined;
  const typeId = Number(r.id.slice(BLUEPRINT_ID_PREFIX.length));
  return Number.isSafeInteger(typeId) && typeId > 0 ? typeId : undefined;
}

function recentImage(r: StoredRecent): EveImageDescriptor | undefined {
  const blueprintTypeId = storedBlueprintTypeId(r);
  return blueprintTypeId !== undefined ? blueprintImage(blueprintTypeId) : undefined;
}

function rendersIcon(r: StoredRecent): boolean {
  return r.kind !== BLUEPRINT_KIND || (r.typeId !== undefined && recentImage(r) !== undefined);
}

function toRecentResult(r: StoredRecent): SearchResult {
  const icon = recentImage(r);
  return {
    ...r,
    ...(icon ? { icon } : {}),
    kind: 'recent',
    originKind: r.kind,
  };
}

const recents = createStoredList({
  key: 'lgi:search:recents',
  max: 10,
  item: storedRecentSchema,
  sameEntry: (a, b) => a.id === b.id,
  keep: rendersIcon,
  project: (entries) => (entries.length === 0 ? EMPTY_RECENTS : entries.map(toRecentResult)),
  serverValue: EMPTY_RECENTS,
});

/** This device's recent search picks, newest first, as `recent` rows. */
export function useSearchRecents(): SearchResult[] {
  return useClientStore(recents);
}

export function pushRecent(result: SearchResult): void {
  if (result.kind === 'recent') return;
  if (result.disabled) return;
  recents.push({
    kind: result.kind,
    id: result.id,
    label: result.label,
    sub: result.sub,
    href: result.href,
    iconText: result.iconText,
    iconTone: result.iconTone,
    typeId: result.typeId,
  });
}
