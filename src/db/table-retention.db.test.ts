import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { GSC_RETENTION_DAYS } from '@/data/gsc/constants';
import { DOMAIN_EVENT_RETENTION_DAYS } from '@/data/domain-events/constants';
import { pruneDomainEvents } from '@/data/domain-events/queries';
import { domainEvents } from '@/data/domain-events/schema';
import { pruneGscSearchAnalytics, pruneGscUrlInspections } from '@/data/gsc/queries';
import { gscSearchAnalytics, gscUrlInspection } from '@/data/gsc/schema';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/features/auth/constants';
import { pruneCorpAccessAudit } from '@/features/auth/affiliation-store';
import { pruneExpiredVerifications } from '@/features/auth/verification-retention';
import { corpAccessAudit, verification } from '@/features/auth/schema';
import { createDbTestHarness } from './test-support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_table_retention',
  tables: [
    'corp_access_audit',
    'domain_events',
    'gsc_search_analytics',
    'gsc_url_inspection',
    'verification',
  ],
});
const NOW = new Date('2026-07-14T12:00:00Z');
const CUTOFF = new Date(NOW.getTime() - GSC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
const CUTOFF_DAY = CUTOFF.toISOString().slice(0, 10);
const OLD_DAY = new Date(CUTOFF.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const NEW_DAY = new Date(CUTOFF.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const VERIFICATION_CUTOFF = new Date(
  NOW.getTime() - VERIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
);

describe.skipIf(!harness.reachable)('table retention prunes execute against Postgres', () => {
  it('deletes rows beyond each retention horizon and preserves the boundary', async () => {
    const database = harness.db;
    await database.insert(gscSearchAnalytics).values(
      [OLD_DAY, CUTOFF_DAY, NEW_DAY].map((date) => ({
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
      [OLD_DAY, CUTOFF_DAY, NEW_DAY].map((inspectionDate) => ({
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
        decidedAt: new Date(CUTOFF.getTime() - 1),
        userId: 'old',
        corporationId: 1,
        characterId: 1,
        allowed: false,
        reason: 'old',
      },
      {
        id: 2,
        decidedAt: CUTOFF,
        userId: 'boundary',
        corporationId: 1,
        characterId: 2,
        allowed: true,
        reason: 'boundary',
      },
      {
        id: 3,
        decidedAt: new Date(CUTOFF.getTime() + 1),
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
        occurredAt: new Date(CUTOFF.getTime() - 1),
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
        occurredAt: CUTOFF,
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
        occurredAt: new Date(CUTOFF.getTime() + 1),
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
    await database.insert(verification).values([
      {
        id: 'old',
        identifier: 'oauth-state',
        value: 'old',
        expiresAt: new Date(VERIFICATION_CUTOFF.getTime() - 1),
      },
      {
        id: 'boundary',
        identifier: 'oauth-state',
        value: 'boundary',
        expiresAt: VERIFICATION_CUTOFF,
      },
      {
        id: 'new',
        identifier: 'oauth-state',
        value: 'new',
        expiresAt: new Date(VERIFICATION_CUTOFF.getTime() + 1),
      },
    ]);

    await pruneGscSearchAnalytics(database, GSC_RETENTION_DAYS, NOW);
    await pruneGscUrlInspections(database, GSC_RETENTION_DAYS, NOW);
    await pruneCorpAccessAudit(database, CORP_ACCESS_AUDIT_RETENTION_DAYS, NOW);
    await pruneDomainEvents(database, DOMAIN_EVENT_RETENTION_DAYS, NOW);
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
    const verifications = await database
      .select({ id: verification.id })
      .from(verification)
      .orderBy(asc(verification.expiresAt));

    expect(analytics).toEqual([{ date: CUTOFF_DAY }, { date: NEW_DAY }]);
    expect(inspections).toEqual([{ date: CUTOFF_DAY }, { date: NEW_DAY }]);
    expect(audits).toEqual([{ userId: 'boundary' }, { userId: 'new' }]);
    expect(retainedEvents).toEqual([{ id: 2 }, { id: 3 }]);
    expect(verifications).toEqual([{ id: 'boundary' }, { id: 'new' }]);
  });
});
