import { describe, expect, it } from 'vitest';
import { CORP_CONTEXT_SYNC_SCOPES } from '@/data/corp-holdings/context-sync';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';

describe('corp context sync scopes', () => {
  it('requests only scopes sign-in asks for', () => {
    const requested = new Set<string>(EVE_SCOPES);
    for (const scope of CORP_CONTEXT_SYNC_SCOPES) {
      expect(requested.has(scope), `${scope} is not in EVE_SCOPES`).toBe(true);
    }
  });
});
