import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from './eve-sso';
import { deriveCharacterHealth } from './scope-health';

const ALL_COMMA = [...EVE_SCOPES].join(',');
const ALL_SPACE = [...EVE_SCOPES].join(' ');

describe('deriveCharacterHealth', () => {
  it('is healthy when every required scope is granted and a refresh token exists', () => {
    expect(deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: true })).toEqual({
      needsReconnect: false,
      missingScopes: [],
    });
  });

  it('parses a space-delimited scope string the same as comma-delimited', () => {
    expect(deriveCharacterHealth({ scope: ALL_SPACE, hasRefreshToken: true })).toEqual({
      needsReconnect: false,
      missingScopes: [],
    });
  });

  it('flags the specific missing scopes when one is absent', () => {
    const missing = EVE_SCOPES[1];
    const partial = EVE_SCOPES.filter((s) => s !== missing).join(',');
    const result = deriveCharacterHealth({ scope: partial, hasRefreshToken: true });
    expect(result.needsReconnect).toBe(true);
    expect(result.missingScopes).toEqual([missing]);
  });

  it('needs reconnect when the refresh token is gone, even with full scopes', () => {
    const result = deriveCharacterHealth({ scope: ALL_COMMA, hasRefreshToken: false });
    expect(result.needsReconnect).toBe(true);
    expect(result.missingScopes).toEqual([]);
  });

  it('treats a null/empty scope as fully missing', () => {
    expect(deriveCharacterHealth({ scope: null, hasRefreshToken: true })).toEqual({
      needsReconnect: true,
      missingScopes: [...EVE_SCOPES],
    });
    expect(deriveCharacterHealth({ scope: '', hasRefreshToken: true }).missingScopes).toEqual([
      ...EVE_SCOPES,
    ]);
  });
});
