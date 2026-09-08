export interface ExpectedPrincipal {
  userId: string;
  characterId: number;
  name: string;
}

export function assertRouteOutcome({ actualURL, expectedURL, status, ready, errorShell }: {
  actualURL: string;
  expectedURL: string;
  status: number | null;
  ready: boolean;
  errorShell: boolean;
}): void {
  const actual = new URL(actualURL);
  const expected = new URL(expectedURL);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.search !== expected.search) {
    throw new Error(`Route identity mismatch: expected ${expected.pathname}, observed ${actual.pathname}`);
  }
  if (status === null || status < 200 || status >= 300) {
    throw new Error(`Route navigation failed: HTTP ${status ?? 'no response'}`);
  }
  if (!ready || errorShell) throw new Error('Route content did not reach its required ready state');
}

export function assertPrincipal({ session, expected }: {
  session: unknown;
  expected: ExpectedPrincipal;
}): void {
  if (
    session === null || typeof session !== 'object' ||
    !('user' in session) || session.user === null || typeof session.user !== 'object' ||
    !('id' in session.user) || session.user.id !== expected.userId ||
    !('characterId' in session) || session.characterId !== expected.characterId ||
    !('name' in session) || session.name !== expected.name
  ) {
    throw new Error('Authenticated principal does not match the required account and active character');
  }
}

export function assertMapRole({ actual, required }: {
  actual: unknown;
  required: 'admin' | 'editor' | 'viewer';
}): void {
  if (actual !== required) throw new Error(`Map role mismatch: required ${required}`);
}

export function assertMovementOutcome({ before, after, minimumDistance }: {
  before: { x: number; y: number };
  after: { x: number; y: number };
  minimumDistance: number;
}): void {
  const distance = Math.hypot(after.x - before.x, after.y - before.y);
  if (!Number.isFinite(minimumDistance) || minimumDistance <= 0) {
    throw new Error('Movement contract needs a positive finite minimum distance');
  }
  if (!Number.isFinite(distance) || distance < minimumDistance) {
    throw new Error(`Movement outcome failed: required at least ${minimumDistance}px displacement`);
  }
}
