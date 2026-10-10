import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { DOMAIN_EVENT_RETENTION_DAYS } from '@/data/domain-events/constants';
import { pruneDomainEvents } from '@/data/domain-events/queries';
import { domainEvents } from '@/data/domain-events/schema';
import { GSC_RETENTION_DAYS } from '@/data/gsc/constants';
import { pruneGscSearchAnalytics, pruneGscUrlInspections } from '@/data/gsc/queries';
import { gscSearchAnalytics, gscUrlInspection } from '@/data/gsc/schema';
import { USAGE_LOG_RETENTION_DAYS } from '@/data/telemetry/constants';
import { pruneUsageLogs } from '@/data/telemetry/queries';
import { usageLogs } from '@/data/telemetry/schema';
import { retentionCutoff, retentionCutoffDay } from '@/lib/batched-delete';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/platform/auth/constants';
import { pruneCorpAccessAudit } from '@/platform/auth/affiliation-store';
import { pruneExpiredVerifications } from '@/platform/auth/verification-retention';
import { corpAccessAudit, verification } from '@/db/auth-schema';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_table_retention',
  tables: [
    'corp_access_audit',
    'domain_events',
    'gsc_search_analytics',
    'gsc_url_inspection',
    'usage_logs',
    'verification',
  ],
});
const NOW = new Date('2026-07-14T12:00:00Z');

/** Instants just past, exactly at, and just inside one table's retention horizon. */
function aroundCutoff(retentionDays: number) {
  const cutoff = retentionCutoff(retentionDays, NOW);
  return {
    old: new Date(cutoff.getTime() - 1),
    boundary: cutoff,
    new: new Date(cutoff.getTime() + 1),
  };
}

describe.skipIf(!harness.reachable)('table retention prunes execute against Postgres', () => {
  it('deletes rows beyond each retention horizon and preserves the boundary', async () => {
    const database = harness.db;
    const gscDays = {
      old: retentionCutoffDay(GSC_RETENTION_DAYS + 1, NOW),
      boundary: retentionCutoffDay(GSC_RETENTION_DAYS, NOW),
      new: retentionCutoffDay(GSC_RETENTION_DAYS - 1, NOW),
    };
    const audit = aroundCutoff(CORP_ACCESS_AUDIT_RETENTION_DAYS);
    const events = aroundCutoff(DOMAIN_EVENT_RETENTION_DAYS);
    const usage = aroundCutoff(USAGE_LOG_RETENTION_DAYS);
    const expiry = aroundCutoff(VERIFICATION_RETENTION_DAYS);

    await database.insert(gscSearchAnalytics).values(
      [gscDays.old, gscDays.boundary, gscDays.new].map((date) => ({
        date,
        dimension: 'total',
        key: '',
        clicks: 1,
        impressions: 1,
        position: 1,
        syncedAt: NOW,
      })),
    );
    await database.insert(gscUrlInspection).values(
      [gscDays.old, gscDays.boundary, gscDays.new].map((inspectionDate) => ({
        inspectionDate,
        url: 'https://lgi.tools/',
        sitemapUrlCount: 1,
        verdict: 'PASS',
        syncedAt: NOW,
      })),
    );
    await database.insert(corpAccessAudit).values([
      {
        id: 1,
        decidedAt: audit.old,
        userId: 'old',
        corporationId: 1,
        characterId: 1,
        allowed: false,
        reason: 'old',
      },
      {
        id: 2,
        decidedAt: audit.boundary,
        userId: 'boundary',
        corporationId: 1,
        characterId: 2,
        allowed: true,
        reason: 'boundary',
      },
      {
        id: 3,
        decidedAt: audit.new,
        userId: 'new',
        corporationId: 1,
        characterId: 3,
        allowed: true,
        reason: 'new',
      },
    ]);
    await database.insert(domainEvents).values([
      {
        id: 1,
        occurredAt: events.old,
        eventType: 'price_refresh_finished',
        metadata: {
          outcome: 'completed',
          fetched: 1,
          written: 1,
          esiCount: 1,
          fuzzworkFallbackCount: 0,
          budgetExhausted: false,
          durationMs: 1,
        },
      },
      {
        id: 2,
        occurredAt: events.boundary,
        eventType: 'price_refresh_finished',
        metadata: {
          outcome: 'completed',
          fetched: 1,
          written: 1,
          esiCount: 1,
          fuzzworkFallbackCount: 0,
          budgetExhausted: false,
          durationMs: 1,
        },
      },
      {
        id: 3,
        occurredAt: events.new,
        eventType: 'price_refresh_finished',
        metadata: {
          outcome: 'completed',
          fetched: 1,
          written: 1,
          esiCount: 1,
          fuzzworkFallbackCount: 0,
          budgetExhausted: false,
          durationMs: 1,
        },
      },
    ]);
    await database.insert(usageLogs).values([
      { id: 1, timestamp: usage.old, action: 'auth_login' },
      { id: 2, timestamp: usage.boundary, action: 'auth_login' },
      { id: 3, timestamp: usage.new, action: 'auth_login' },
    ]);
    await database.insert(verification).values([
      {
        id: 'old',
        identifier: 'oauth-state',
        value: 'old',
        expiresAt: expiry.old,
      },
      {
        id: 'boundary',
        identifier: 'oauth-state',
        value: 'boundary',
        expiresAt: expiry.boundary,
      },
      {
        id: 'new',
        identifier: 'oauth-state',
        value: 'new',
        expiresAt: expiry.new,
      },
    ]);

    await pruneGscSearchAnalytics(database, GSC_RETENTION_DAYS, NOW);
    await pruneGscUrlInspections(database, GSC_RETENTION_DAYS, NOW);
    await pruneCorpAccessAudit(database, CORP_ACCESS_AUDIT_RETENTION_DAYS, NOW);
    await pruneDomainEvents(database, DOMAIN_EVENT_RETENTION_DAYS, NOW);
    await expect(pruneUsageLogs(database, USAGE_LOG_RETENTION_DAYS, NOW)).resolves.toEqual({
      deleted: 1,
      finished: true,
    });
    await pruneExpiredVerifications(database, VERIFICATION_RETENTION_DAYS, NOW);

    const analytics = await database
      .select({ date: gscSearchAnalytics.date })
      .from(gscSearchAnalytics)
      .orderBy(asc(gscSearchAnalytics.date));
    const inspections = await database
      .select({ date: gscUrlInspection.inspectionDate })
      .from(gscUrlInspection)
      .orderBy(asc(gscUrlInspection.inspectionDate));
    const audits = await database
      .select({ userId: corpAccessAudit.userId })
      .from(corpAccessAudit)
      .orderBy(asc(corpAccessAudit.decidedAt));
    const retainedEvents = await database
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .orderBy(asc(domainEvents.occurredAt));
    const retainedUsage = await database
      .select({ id: usageLogs.id })
      .from(usageLogs)
      .orderBy(asc(usageLogs.timestamp));
    const verifications = await database
      .select({ id: verification.id })
      .from(verification)
      .orderBy(asc(verification.expiresAt));

    expect(analytics).toEqual([{ date: gscDays.boundary }, { date: gscDays.new }]);
    expect(inspections).toEqual([{ date: gscDays.boundary }, { date: gscDays.new }]);
    expect(audits).toEqual([{ userId: 'boundary' }, { userId: 'new' }]);
    expect(retainedEvents).toEqual([{ id: 2 }, { id: 3 }]);
    expect(retainedUsage).toEqual([{ id: 2 }, { id: 3 }]);
    expect(verifications).toEqual([{ id: 'boundary' }, { id: 'new' }]);
  });
});
