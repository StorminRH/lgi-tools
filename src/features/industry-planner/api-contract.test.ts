import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  availableStructureSchema,
  blueprintIndexEntrySchema,
  buildLocationResponseSchema,
} from './api-contract';
import type {
  AvailableStructure,
  BlueprintIndexEntry,
  BuildLocationData,
} from './types';

describe('industry-planner contract', () => {
  it('pins the wire entry to BlueprintIndexEntry exactly (both directions)', () => {
    // The schema carries `satisfies z.ZodType<BlueprintIndexEntry>` (no extra
    // fields); this catches the reverse drift — a type field the schema lacks.
    expectTypeOf<z.infer<typeof blueprintIndexEntrySchema>>().toEqualTypeOf<BlueprintIndexEntry>();
  });

  it('pins the build-location response to BuildLocationData exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof buildLocationResponseSchema>>().toEqualTypeOf<BuildLocationData>();
  });

  it('carries a numeric groupId on the available structure (schema ⇄ type)', () => {
    // Guards the coverage seam: adding groupId to the type but not the schema would
    // silently strip it at runtime (the whole structure can't be toEqualTypeOf-pinned
    // because attrMapSchema infers string keys vs AttrMap's number keys — so pin the
    // one scalar field both ways).
    expectTypeOf<z.infer<typeof availableStructureSchema>['groupId']>().toEqualTypeOf<number>();
    expectTypeOf<AvailableStructure['groupId']>().toEqualTypeOf<number>();
  });

  it('carries a nullable taxPct on the available structure (schema ⇄ type)', () => {
    // The groupId twin (3.7.13.3): the owner-set facility tax must survive the wire —
    // dropping it from the schema would silently strip it and every structure would
    // fall back to the 0.25% NPC-baseline assumption.
    expectTypeOf<z.infer<typeof availableStructureSchema>['taxPct']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<AvailableStructure['taxPct']>().toEqualTypeOf<number | null>();
  });
});
