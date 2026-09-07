import type { SemanticWrite } from '@/data/maps/semantic-write';
import { postJumpRequest } from '../jump-client';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';

export interface TypeSetterFollowUp {
  readonly mapId: string;
  readonly connectionId: string;
  readonly write: SemanticWrite | undefined;
}

function createTypeSetterFollowUp() {
  const attempts = new Map<string, Promise<boolean>>();
  return async (input: {
    readonly key: string;
    readonly write: SemanticWrite | undefined;
    readonly run: () => Promise<boolean>;
  }): Promise<void> => {
    if (input.write === undefined) return;
    if (input.write.kind === 'idle') {
      const previous = attempts.get(input.key);
      if (previous === undefined || await previous) return;
      if (attempts.get(input.key) !== previous) return;
    }
    const request = input.run();
    const attempt = request.catch(() => false);
    attempts.set(input.key, attempt);
    const succeeded = await request;
    if (succeeded && attempts.get(input.key) === attempt) attempts.delete(input.key);
  };
}

const followUpElimination = createTypeSetterFollowUp();
const followUpTypedHole = createTypeSetterFollowUp();

export function followUpTypeSetterElimination(input: TypeSetterFollowUp & {
  readonly systemId: number;
}): Promise<void> {
  return followUpElimination({
    key: JSON.stringify([input.mapId, input.connectionId, input.systemId]),
    write: input.write,
    run: async () => {
      const outcome = await eliminateSignaturesAndAnnounce({
        mapId: input.mapId,
        systemIds: [input.systemId],
      });
      const result = outcome?.results.find((entry) => entry.systemId === input.systemId);
      return result?.status === 'applied' || result?.status === 'quiet';
    },
  });
}

export function followUpTypeSetterTypedHole(input: TypeSetterFollowUp): Promise<void> {
  return followUpTypedHole({
    key: JSON.stringify([input.mapId, input.connectionId]),
    write: input.write,
    run: async () => {
      const outcome = await postJumpRequest({
        kind: 'typed-hole',
        mapId: input.mapId,
        connectionId: input.connectionId,
      });
      return outcome !== null && outcome.status !== 'retry';
    },
  });
}
