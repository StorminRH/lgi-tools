import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import {
  applyEliminationDoor,
  authorJumpDoor,
  confirmJumpDoor,
  eliminationEvidenceDoor,
  jumpConnectionEvidenceDoor,
  jumpTransitionEvidenceDoor,
  reassociateJumpDoor,
} from '@/data/maps/convex-doors';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { authorizedJsonAction } from './lib/httpAuth';

// Operations that share a path register once and dispatch on their discriminant.
const jumpEvidenceBodySchema = z.discriminatedUnion('mode', [
  jumpTransitionEvidenceDoor.request,
  jumpConnectionEvidenceDoor.request,
]);

const resolveJumpBodySchema = z.discriminatedUnion('operation', [
  authorJumpDoor.request,
  confirmJumpDoor.request,
  reassociateJumpDoor.request,
]);

const signatureEliminationBodySchema = z.discriminatedUnion('operation', [
  eliminationEvidenceDoor.request,
  applyEliminationDoor.request,
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
