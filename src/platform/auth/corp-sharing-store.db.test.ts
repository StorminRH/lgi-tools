import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { corpDataSharing } from '@/db/auth-schema';
import { readCorpSharing, setCorpSharing } from './corp-sharing-store';

const harness = await createDbTestHarness({
  schema: 'test_corp_sharing_store',
  tables: ['corp_structure_sharing'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const CORP = 98000001;
const OTHER_CORP = 98000002;
const DIRECTOR = 90001;

describe.skipIf(!harness.reachable)('corp sharing store against Postgres', () => {
  it('reads a corp with no row as off', async () => {
    expect(await readCorpSharing([CORP, OTHER_CORP])).toEqual(new Map([[CORP, 'off'], [OTHER_CORP, 'off']]));
    expect(await readCorpSharing([])).toEqual(new Map());
  });

  it('keeps one row per corp when the switch is set again', async () => {
    await setCorpSharing(CORP, true, DIRECTOR);
    await setCorpSharing(CORP, true, DIRECTOR);
    await setCorpSharing(CORP, false, null);

    expect(await readCorpSharing([CORP])).toEqual(new Map([[CORP, 'off']]));
    const rows = await harness.db
      .select({ corporationId: corpDataSharing.corporationId, enabled: corpDataSharing.enabled, setBy: corpDataSharing.setBy })
      .from(corpDataSharing);
    expect(rows).toEqual([{ corporationId: CORP, enabled: false, setBy: null }]);
  });
});
