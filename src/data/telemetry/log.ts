import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db';
import { usageLogs } from './schema';
import type { UsageAction } from './types';

export async function logUsageEvent(input: {
  action: UsageAction;
  characterId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(usageLogs).values({
    action: input.action,
    characterId: input.characterId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function claimPublicEsiBudgetAlert(
  metadata: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(usageLogs)
    .values({
      action: 'public_esi_budget_alert_claimed',
      characterId: null,
      metadata,
    })
    .returning({ id: usageLogs.id });
  if (!row) throw new Error('Failed to create public ESI budget alert claim');
  return row.id;
}

export async function completePublicEsiBudgetAlertClaim(id: number): Promise<void> {
  const [row] = await db
    .update(usageLogs)
    .set({ action: 'public_esi_budget_alerted' })
    .where(and(eq(usageLogs.id, id), eq(usageLogs.action, 'public_esi_budget_alert_claimed')))
    .returning({ id: usageLogs.id });
  if (!row) throw new Error('Failed to complete public ESI budget alert claim');
}

export async function pruneUsageLogs(retentionDays: number, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(usageLogs).where(lt(usageLogs.timestamp, cutoff));
}
