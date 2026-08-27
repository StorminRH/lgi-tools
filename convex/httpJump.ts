import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { authorizedJsonAction } from './lib/httpAuth';

const jumpEvidenceBodySchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('transition'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    characterId: z.number().int().positive(),
  }),
  z.strictObject({
    mode: z.literal('connection'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
  }),
]);

const jumpDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resolve'),
    candidateId: z.string().min(1),
    provenance: z.enum(['jump-verified', 'assumed']),
    candidateIds: z.array(z.string().min(1)),
    survivors: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal('insert'),
    candidateIds: z.array(z.string().min(1)),
    survivors: z.array(z.string().min(1)),
  }),
]);

const resolveJumpBodySchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('author'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    characterId: z.number().int().positive(),
    fromSolarSystemId: z.number().int().positive(),
    toSolarSystemId: z.number().int().positive(),
    transitionObservedAt: z.number().finite(),
    observedShipMassKg: z.number().finite().positive().nullable(),
    observationKey: z.string().min(1),
    decision: jumpDecisionSchema,
  }),
  z.object({
    operation: z.literal('confirm'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
  }),
  z.object({
    operation: z.literal('reassociate'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
    targetConnectionId: z.string().min(1),
  }),
]);

const eliminationDeductionSchema = z.union([
  z.strictObject({
    signatureId: z.string().min(1),
    typeCode: z.string().min(1),
    provenance: z.literal('assumed'),
  }),
  z.strictObject({
    signatureId: z.string().min(1),
    connectionId: z.string().min(1),
    provenance: z.literal('assumed'),
    expectedTypeCode: z.string().min(1).nullable(),
  }),
]);

const signatureEliminationBodySchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('evidence'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    systemId: z.number().int().positive(),
  }),
  z.strictObject({
    operation: z.literal('apply'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    systemId: z.number().int().positive(),
    deductions: z.array(eliminationDeductionSchema).min(1),
  }),
]);

export const jumpEvidence: PublicHttpAction = authorizedJsonAction(jumpEvidenceBodySchema, async (ctx, body) => {
  if (body.mode === 'connection') {
    return Response.json(
      await ctx.runQuery(internal.mapJumpEvidence.connectionEvidence, {
        userId: body.userId,
        mapId: body.mapId,
        connectionId: body.connectionId as Id<'mapConnections'>,
      }),
    );
  }
  return Response.json(
    await ctx.runQuery(internal.mapJumpEvidence.jumpEvidence, {
      userId: body.userId,
      mapId: body.mapId,
      characterId: body.characterId,
    }),
  );
});

export const resolveJump: PublicHttpAction = authorizedJsonAction(resolveJumpBodySchema, async (ctx, body) => {
  if (body.operation === 'confirm') {
    return Response.json(
      await ctx.runMutation(internal.mapJumpIdentity.confirmJumpIdentity, {
        userId: body.userId,
        mapId: body.mapId,
        connectionId: body.connectionId as Id<'mapConnections'>,
      }),
    );
  }
  if (body.operation === 'reassociate') {
    return Response.json(
      await ctx.runMutation(internal.mapJumpIdentity.reassociateJumpDestination, {
        userId: body.userId,
        mapId: body.mapId,
        connectionId: body.connectionId as Id<'mapConnections'>,
        targetConnectionId: body.targetConnectionId as Id<'mapConnections'>,
      }),
    );
  }
  const decision = body.decision.kind === 'resolve'
    ? {
        ...body.decision,
        candidateId: body.decision.candidateId as Id<'mapConnections'>,
        candidateIds: body.decision.candidateIds as Id<'mapConnections'>[],
        survivors: body.decision.survivors as Id<'mapConnections'>[],
      }
    : {
        ...body.decision,
        candidateIds: body.decision.candidateIds as Id<'mapConnections'>[],
        survivors: body.decision.survivors as Id<'mapConnections'>[],
      };
  return Response.json(
    await ctx.runMutation(internal.mapJumpAuthoring.resolveJumpAuthoring, {
      userId: body.userId,
      mapId: body.mapId,
      characterId: body.characterId,
      fromSolarSystemId: body.fromSolarSystemId,
      toSolarSystemId: body.toSolarSystemId,
      transitionObservedAt: body.transitionObservedAt,
      observedShipMassKg: body.observedShipMassKg,
      observationKey: body.observationKey,
      decision,
    }),
  );
});

export const signatureElimination: PublicHttpAction = authorizedJsonAction(
  signatureEliminationBodySchema,
  async (ctx, body) => {
    if (body.operation === 'evidence') {
      return Response.json(
        await ctx.runQuery(internal.mapScan.eliminationEvidence, {
          userId: body.userId,
          mapId: body.mapId,
          systemId: body.systemId,
        }),
      );
    }
    return Response.json(
      await ctx.runMutation(internal.mapScan.applyEliminationDeductions, {
        userId: body.userId,
        mapId: body.mapId,
        systemId: body.systemId,
        deductions: body.deductions.map((deduction) =>
          'connectionId' in deduction
            ? {
                ...deduction,
                connectionId: deduction.connectionId as Id<'mapConnections'>,
              }
            : deduction,
        ),
      }),
    );
  },
);
