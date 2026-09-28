import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account } from '@/db/auth-schema';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { NET_WORTH_HISTORY_DAYS } from './constants';
import { netWorthDays } from './schema';
import type { NetWorthDay } from './types';

export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * One statement: the keyed upsert of the day's row and the prune to the newest rows both run as
 * data-modifying CTEs, so they land together on the transaction-free request path. The prune ranks the
 * pre-statement rows together with today's day explicitly, because a CTE cannot see the row its
 * sibling inserts.
 */
export async function upsertNetWorthDay(userId: string, snapshot: NetWorthDay, recordedAt: Date): Promise<void> {
  const pilotIds = Object.keys(snapshot.pilots);
  if (pilotIds.length === 0) return;
  const pilots = JSON.stringify(snapshot.pilots);
  await db.execute(sql`
    -- Hold the links through the write. Unlink/transfer either waits and then purges
    -- this row, or commits first and makes the captured snapshot ineligible.
    WITH linked AS MATERIALIZED (
      SELECT account_id FROM ${account}
      WHERE user_id = ${userId} AND provider_id = ${EVE_PROVIDER_ID}
        AND account_id IN (SELECT jsonb_object_keys(${pilots}::jsonb))
      ORDER BY id FOR SHARE
    ), upserted AS (
      INSERT INTO ${netWorthDays}
        (user_id, day, net_worth, liquid_isk, pilots_included, pilots_total, pilots, recorded_at)
      SELECT
        ${userId}, ${snapshot.day}::date, ${snapshot.netWorth}, ${snapshot.liquidIsk},
        ${snapshot.pilotsIncluded}, ${snapshot.pilotsTotal}, ${pilots}::jsonb, ${recordedAt.toISOString()}::timestamptz
      WHERE (SELECT count(*) FROM linked) = ${pilotIds.length}
      ON CONFLICT (user_id, day) DO UPDATE SET
        net_worth = excluded.net_worth,
        liquid_isk = excluded.liquid_isk,
        pilots_included = excluded.pilots_included,
        pilots_total = excluded.pilots_total,
        pilots = excluded.pilots,
        recorded_at = excluded.recorded_at
      RETURNING day
    ),
    kept AS (
      SELECT day FROM (
        SELECT day FROM ${netWorthDays} WHERE user_id = ${userId}
        UNION SELECT ${snapshot.day}::date
      ) AS days
      ORDER BY day DESC
      LIMIT ${NET_WORTH_HISTORY_DAYS}
    )
    DELETE FROM ${netWorthDays}
    WHERE user_id = ${userId} AND day NOT IN (SELECT day FROM kept)
      AND EXISTS (SELECT 1 FROM upserted)
  `);
}

/** Oldest first, at most the retained window. */
export async function getNetWorthHistory(userId: string): Promise<NetWorthDay[]> {
  const rows = await db
    .select({
      day: netWorthDays.day,
      netWorth: netWorthDays.netWorth,
      liquidIsk: netWorthDays.liquidIsk,
      pilotsIncluded: netWorthDays.pilotsIncluded,
      pilotsTotal: netWorthDays.pilotsTotal,
      pilots: netWorthDays.pilots,
    })
    .from(netWorthDays)
    .where(eq(netWorthDays.userId, userId))
    .orderBy(desc(netWorthDays.day))
    .limit(NET_WORTH_HISTORY_DAYS);
  return rows.reverse();
}
