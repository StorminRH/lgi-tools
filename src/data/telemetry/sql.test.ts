import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, test } from 'vitest';
import { usageLogs } from './schema';
import { metadataOutcome, usageDay } from './sql';

test('the shared day and outcome fragments bind nothing, so GROUP BY repeats the selected SQL', () => {
  const grouped = drizzle
    .mock()
    .select({ day: usageDay, outcome: metadataOutcome, runs: count() })
    .from(usageLogs)
    .where(eq(usageLogs.action, 'cron_prices'))
    .groupBy(usageDay, metadataOutcome)
    .toSQL();

  // A single-table select list leaves columns unqualified; Postgres resolves
  // both spellings to the same column, so the grouped expression matches.
  expect(grouped).toEqual({
    sql:
      `select ("timestamp" at time zone 'UTC')::date, "metadata" ->> 'outcome', count(*) ` +
      `from "usage_logs" where "usage_logs"."action" = $1 ` +
      `group by ("usage_logs"."timestamp" at time zone 'UTC')::date, "usage_logs"."metadata" ->> 'outcome'`,
    params: ['cron_prices'],
  });
});
