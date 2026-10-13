import { expect, test } from 'vitest';
import { z } from 'zod';
import {
  conflictFailure,
  forbiddenFailure,
  rateLimitedFailure,
  unauthenticatedFailure,
  validationFailure,
  type AppFailure,
} from '@/lib/failure';
import { problemBody, serializeProblem } from '@/lib/problem';
import { apiProblem, networkDown } from './__tests__/failed-outcomes';
import { decodeEndpointResponse } from './decode';
import { defineEndpoint, emptyBody, jsonBody, problem } from './endpoint';
import { failureCode, failureMessage, type FailedOutcome, type FailureCopy } from './failure-copy';

const saveEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/save',
  request: z.object({ name: z.string() }),
  responses: {
    204: emptyBody(),
    400: problem('invalid_body', 'unknown_system'),
    401: problem('unauthenticated'),
    409: problem('structure_limit'),
    429: problem('rate_limited'),
  },
});

const removeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/remove',
  request: z.object({ id: z.string() }),
  responses: {
    204: emptyBody(),
    403: problem('not_owner'),
    409: jsonBody(z.object({ reason: z.string() })),
  },
});

const openEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/open',
  request: null,
  responses: { 200: emptyBody(), 400: problem() },
});

type SaveFailure = FailedOutcome<typeof saveEndpoint>;
type RemoveFailure = FailedOutcome<typeof removeEndpoint>;

const SAVE_COPY = {
  fallback: 'The structure could not be saved.',
  codes: { structure_limit: 'Structure limit reached. Delete one to make room.' },
} satisfies FailureCopy<SaveFailure>;

/** A save the server answered with `response`, decoded as apiFetch decodes it. */
async function savedWith(response: Response): Promise<SaveFailure> {
  const outcome = await decodeEndpointResponse(saveEndpoint, response);
  if (outcome.ok) throw new Error('expected the save to fail');
  return outcome;
}

const refusal = (failure: AppFailure) => serializeProblem(problemBody(failure, 'test-correlation-id'));

test('a refused save reads its own code, then the shared session and rate-limit copy, then the fallback', async () => {
  const save = async (response: Response) => failureMessage(await savedWith(response), SAVE_COPY);

  expect(await save(refusal(conflictFailure('structure_limit')))).toBe(
    'Structure limit reached. Delete one to make room.',
  );
  // A declared code the table leaves out, and an answer nobody declared, both fall back.
  expect(await save(refusal(validationFailure('unknown_system')))).toBe('The structure could not be saved.');
  expect(await save(new Response('Internal Server Error', { status: 500 }))).toBe(
    'The structure could not be saved.',
  );

  expect(await save(refusal(unauthenticatedFailure()))).toBe('Your session has ended. Sign in again.');
  expect(await save(refusal(rateLimitedFailure(42)))).toBe('Too many attempts. Try again in 42 seconds.');
  expect(await save(refusal(rateLimitedFailure(1)))).toBe('Too many attempts. Try again in 1 second.');
  expect(await save(refusal({ category: 'rate_limited', code: 'rate_limited' }))).toBe(
    'Too many attempts. Try again in a moment.',
  );

  // A table entry outranks the shared copy.
  expect(
    failureMessage(await savedWith(refusal(unauthenticatedFailure())), {
      fallback: 'Not saved.',
      codes: { unauthenticated: 'Sign in to save structures.' },
    }),
  ).toBe('Sign in to save structures.');
});

test('a call that got no answer asks for a connection check after the fallback, unless the copy names its own', () => {
  expect(failureMessage(networkDown(), SAVE_COPY)).toBe(
    'The structure could not be saved. Check your connection and try again.',
  );
  // A bare phrase, such as a toast title, ends before the hint.
  expect(failureMessage(networkDown(), { fallback: 'Purge failed' })).toBe(
    'Purge failed. Check your connection and try again.',
  );
  expect(failureMessage(networkDown(), { ...SAVE_COPY, network: 'Offline. Nothing was saved.' })).toBe(
    'Offline. Nothing was saved.',
  );
});

test('the failure code is the declared code, else the kind, and a body that is not a problem reads as protocol', async () => {
  const removedWith = async (response: Response) => {
    const outcome = await decodeEndpointResponse(removeEndpoint, response);
    if (outcome.ok) throw new Error('expected the remove to fail');
    return outcome;
  };
  const code = (failure: SaveFailure | RemoveFailure) => failureCode(failure);

  expect(code(await savedWith(refusal(conflictFailure('structure_limit'))))).toBe('structure_limit');
  expect(code(await removedWith(refusal(forbiddenFailure('not_owner'))))).toBe('not_owner');
  expect(code(networkDown())).toBe('network');
  expect(code(await removedWith(new Response('Bad Gateway', { status: 502 })))).toBe('protocol');
  // A declared JSON refusal carries no code to key a table on.
  expect(code(await removedWith(Response.json({ reason: 'busy' }, { status: 409 })))).toBe('protocol');
});

test('an open vocabulary never matches a code against an inherited member of the table', async () => {
  const copy = { fallback: 'Could not open.', codes: { gone: 'It is gone.' } };
  const open = async (code: string) => {
    const outcome = await decodeEndpointResponse(openEndpoint, refusal(validationFailure(code)));
    if (outcome.ok) throw new Error('expected the open to fail');
    return failureMessage(outcome, copy);
  };

  expect(await open('gone')).toBe('It is gone.');
  expect(await open('toString')).toBe('Could not open.');
  expect(await open('constructor')).toBe('Could not open.');
});

test('copy tables take only the codes their failures declare, across a union of endpoints', () => {
  const either = (failure: SaveFailure | RemoveFailure) =>
    failureMessage(failure, {
      fallback: 'Nothing changed.',
      codes: { structure_limit: 'Limit reached.', not_owner: 'Only the owner can remove it.' },
    });
  expect(either(apiProblem(403, 'not_owner'))).toBe('Only the owner can remove it.');
  expect(either(apiProblem(409, 'structure_limit'))).toBe('Limit reached.');

  const saveOnly = (failure: SaveFailure) =>
    failureMessage(failure, {
      fallback: 'Nothing changed.',
      // @ts-expect-error not_owner is declared by the remove endpoint, not by save.
      codes: { not_owner: 'Only the owner can remove it.' },
    });
  expect(saveOnly(apiProblem(409, 'structure_limit'))).toBe('Nothing changed.');
});
