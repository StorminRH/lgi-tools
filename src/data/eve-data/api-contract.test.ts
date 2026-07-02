import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { systemSearchEntrySchema } from './api-contract';
import type { SystemSearchEntry } from './systems-search';

describe('eve-data contract', () => {
  it('pins the system search entry to SystemSearchEntry exactly (both directions)', () => {
    // The schema carries `satisfies z.ZodType<SystemSearchEntry>` (no extra
    // fields); this catches the reverse drift — a type field the schema lacks.
    expectTypeOf<z.infer<typeof systemSearchEntrySchema>>().toEqualTypeOf<SystemSearchEntry>();
  });
});
