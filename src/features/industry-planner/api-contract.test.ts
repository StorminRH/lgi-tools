import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { blueprintIndexEntrySchema } from './api-contract';
import type { BlueprintIndexEntry } from './types';

describe('industry-planner contract', () => {
  it('pins the wire entry to BlueprintIndexEntry exactly (both directions)', () => {
    // The schema carries `satisfies z.ZodType<BlueprintIndexEntry>` (no extra
    // fields); this catches the reverse drift — a type field the schema lacks.
    expectTypeOf<z.infer<typeof blueprintIndexEntrySchema>>().toEqualTypeOf<BlueprintIndexEntry>();
  });
});
