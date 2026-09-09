function assertRouteOutcome({ actualURL, expectedURL, status, ready, errorShell }) {
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

function assertPrincipal({ session, expected }) {
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

function assertMapRole({ actual, required }) {
  if (actual !== required) throw new Error(`Map role mismatch: required ${required}`);
}

function assertMovementOutcome({ before, after, minimumDistance }) {
  const distance = Math.hypot(after.x - before.x, after.y - before.y);
  if (!Number.isFinite(minimumDistance) || minimumDistance <= 0) {
    throw new Error('Movement contract needs a positive finite minimum distance');
  }
  if (!Number.isFinite(distance) || distance < minimumDistance) {
    throw new Error(`Movement outcome failed: required at least ${minimumDistance}px displacement`);
  }
}

module.exports = {
  assertRouteOutcome, assertPrincipal, assertMapRole, assertMovementOutcome,
};
