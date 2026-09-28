import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { corpDataSharing } from '@/db/auth-schema';
import type { SharingState } from './corp-visibility';

export async function readCorpSharing(corporationIds: readonly number[]): Promise<Map<number, SharingState>> {
  const states = new Map<number, SharingState>(corporationIds.map((id) => [id, 'off']));
  if (corporationIds.length === 0) return states;
  const rows = await db
    .select({ corporationId: corpDataSharing.corporationId, enabled: corpDataSharing.enabled })
    .from(corpDataSharing)
    .where(inArray(corpDataSharing.corporationId, [...corporationIds]));
  for (const row of rows) states.set(row.corporationId, row.enabled ? 'on' : 'off');
  return states;
}

export async function setCorpSharing(corporationId: number, enabled: boolean, setBy: number | null): Promise<void> {
  const now = new Date();
  await db
    .insert(corpDataSharing)
    .values({ corporationId, enabled, setBy, setAt: now })
    .onConflictDoUpdate({ target: corpDataSharing.corporationId, set: { enabled, setBy, setAt: now } });
}
