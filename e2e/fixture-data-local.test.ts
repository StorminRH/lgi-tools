import { describe, expect, it } from 'vitest';
import { requireLocalAuthEnvironment, requireLocalConvexEnvironment } from './fixture-data-local.mjs';
import { createFixtureIdentity, FIXTURE_ROLES } from './identity';

const localAuth = {
  DATABASE_URL: 'postgresql://test:local@127.0.0.1:5432/lgi_test',
  LOCAL_DB_DRIVER: 'postgres-js', BETTER_AUTH_SECRET: 'fixture-test-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
};
const localConvex = {
  CONVEX_DEPLOYMENT: 'local:fixture-test',
  NEXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210',
  CONVEX_SERVICE_SECRET: 'fixture-service-secret',
};

describe('run-owned fixture boundaries', () => {
  it('creates distinct principals for every role and every scenario', () => {
    const identities = ['first', 'second'].flatMap((runId) =>
      FIXTURE_ROLES.map((role) => createFixtureIdentity(runId, role)));
    expect(new Set(identities.map((identity) => identity.userId)).size).toBe(8);
    expect(new Set(identities.map((identity) => identity.characterId)).size).toBe(8);
    for (const identity of identities) {
      expect(Number.isSafeInteger(identity.characterId)).toBe(true);
      expect(identity.userId).not.toBe('e2e-pilot');
      expect(identity.characterId).not.toBe(9_000_001);
    }
  });

  it('permits explicit loopback PostgreSQL and Convex prerequisites', () => {
    expect(requireLocalAuthEnvironment('http://localhost:3000', localAuth).hostname).toBe('localhost');
    expect(() => requireLocalConvexEnvironment(localConvex)).not.toThrow();
  });

  it('rejects effective database overrides that would reach hosted data', () => {
    expect(() => requireLocalAuthEnvironment('http://localhost:3000', {
      ...localAuth, LGI_DATABASE_URL: 'postgresql://private:secret@hosted.example/db',
    })).toThrow('DATABASE_URL must target loopback');
  });

  it.each([
    'https://staging.lgi.tools', 'http://localhost.example:3000', 'file:///tmp/local',
  ])('rejects mutation against nonlocal app %s', (target) => {
    expect(() => requireLocalAuthEnvironment(target, localAuth)).toThrow('E2E_PREREQUISITE');
  });

  it('requires matching local auth origins and the local database driver', () => {
    expect(() => requireLocalAuthEnvironment('http://localhost:3001', localAuth)).toThrow('origins must match');
    expect(() => requireLocalAuthEnvironment('http://localhost:3000', {
      ...localAuth, LOCAL_DB_DRIVER: '',
    })).toThrow('LOCAL_DB_DRIVER');
  });

  it('rejects hosted Convex URLs even when the deployment label looks local', () => {
    expect(() => requireLocalConvexEnvironment({
      ...localConvex, NEXT_PUBLIC_CONVEX_URL: 'https://example.convex.cloud',
    })).toThrow('must target loopback');
    expect(() => requireLocalConvexEnvironment({
      ...localConvex, CONVEX_URL: 'https://example.convex.cloud',
    })).toThrow('must target loopback');
  });

  it('rejects hosted selectors and deploy-key overrides before invoking a command', () => {
    expect(() => requireLocalConvexEnvironment({
      ...localConvex, CONVEX_DEPLOYMENT: 'prod:example',
    })).toThrow('local: or anonymous:');
    expect(() => requireLocalConvexEnvironment({
      ...localConvex, CONVEX_DEPLOY_KEY: 'do-not-echo-sensitive-value',
    })).toThrow('remove CONVEX_DEPLOY_KEY');
    try {
      requireLocalConvexEnvironment({ ...localConvex, CONVEX_DEPLOY_KEY: 'do-not-echo-sensitive-value' });
    } catch (error) {
      expect(String(error)).not.toContain('do-not-echo-sensitive-value');
    }
  });
});
