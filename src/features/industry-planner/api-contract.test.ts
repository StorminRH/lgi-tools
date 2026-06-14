import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  blueprintIndexEntrySchema,
  buildLocationResponseSchema,
  systemSearchEntrySchema,
} from './api-contract';
import type { BlueprintIndexEntry, BuildLocationData, SystemSearchEntry } from './types';

describe('industry-planner contract', () => {
  it('pins the wire entry to BlueprintIndexEntry exactly (both directions)', () => {
    // The schema carries `satisfies z.ZodType<BlueprintIndexEntry>` (no extra
    // fields); this catches the reverse drift — a type field the schema lacks.
    expectTypeOf<z.infer<typeof blueprintIndexEntrySchema>>().toEqualTypeOf<BlueprintIndexEntry>();
  });

  it('pins the system search entry to SystemSearchEntry exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof systemSearchEntrySchema>>().toEqualTypeOf<SystemSearchEntry>();
  });

  it('pins the build-location response to BuildLocationData exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof buildLocationResponseSchema>>().toEqualTypeOf<BuildLocationData>();
  });
});
