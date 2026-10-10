import { z } from 'zod';
import { useClientStore } from '@/lib/client-store';
import { createStoredList } from '@/lib/web-storage';

const recentBlueprintSchema = z.object({
  typeId: z.number().int().positive(),
  productTypeId: z.number().int().positive(),
  name: z.string().min(1),
});

/** A blueprint opened in the planner on this device. */
export type RecentBlueprint = z.infer<typeof recentBlueprintSchema>;

const recentBlueprints = createStoredList<RecentBlueprint, RecentBlueprint[] | null>({
  // The key the planner's landing page has always kept, so a returning
  // pilot's recents are still there.
  key: 'lgi:industry:recent-blueprints',
  max: 8,
  item: recentBlueprintSchema,
  sameEntry: (a, b) => a.typeId === b.typeId,
  project: (entries) => entries,
  serverValue: null,
});

/** The blueprints this device opened last, newest first; null until hydrated. */
export function useRecentBlueprints(): RecentBlueprint[] | null {
  return useClientStore(recentBlueprints);
}

/** Puts a blueprint at the head of this device's recents. */
export function recordRecentBlueprint(entry: RecentBlueprint): void {
  recentBlueprints.push(entry);
}
