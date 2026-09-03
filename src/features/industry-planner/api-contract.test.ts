import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  availableStructuresEndpoint,
  availableStructuresResponseSchema,
  availableStructureSchema,
  blueprintIndexEntrySchema,
  buildLocationResponseSchema,
} from './api-contract';
import type {
  AvailableStructure,
  AvailableStructuresResponse,
  BlueprintIndexEntry,
  BuildLocationData,
} from './types';

describe('industry-planner contract', () => {
  it('pins the wire entry to BlueprintIndexEntry exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof blueprintIndexEntrySchema>>().toEqualTypeOf<BlueprintIndexEntry>();
  });

  it('pins the build-location response to BuildLocationData exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof buildLocationResponseSchema>>().toEqualTypeOf<BuildLocationData>();
  });

  it('carries a numeric groupId on the available structure (schema ⇄ type)', () => {
    expectTypeOf<z.infer<typeof availableStructureSchema>['groupId']>().toEqualTypeOf<number>();
    expectTypeOf<AvailableStructure['groupId']>().toEqualTypeOf<number>();
  });

  it('carries a nullable taxPct on the available structure (schema ⇄ type)', () => {
    expectTypeOf<z.infer<typeof availableStructureSchema>['taxPct']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<AvailableStructure['taxPct']>().toEqualTypeOf<number | null>();
  });

  it('derives the available-structures wire type directly from its schema', () => {
    expectTypeOf<AvailableStructuresResponse>().toEqualTypeOf<
      z.infer<typeof availableStructuresResponseSchema>
    >();
    expect(availableStructuresEndpoint.responses[200].schema).toBe(
      availableStructuresResponseSchema,
    );
  });

  it('does not treat number-indexed dogma maps as the JSON wire type', () => {
    type NumericIndexedStructure = Omit<
      AvailableStructure,
      'structureAttrs' | 'rigAttrs'
    > & {
      structureAttrs: Record<number, number>;
      rigAttrs: Record<number, number>[];
    };
    expectTypeOf<{ structures: NumericIndexedStructure[] }>().not.toEqualTypeOf<
      AvailableStructuresResponse
    >();
  });
});
