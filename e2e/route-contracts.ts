export {
  assertRouteOutcome,
  assertPrincipal,
  assertMapRole,
  assertMovementOutcome,
} from './route-contracts.cjs';

export interface ExpectedPrincipal {
  userId: string;
  characterId: number;
  name: string;
}
