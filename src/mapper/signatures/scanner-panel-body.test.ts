import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { scannerPanelBodyKind } from './scanner-panel-body';

describe('scannerPanelBodyKind', () => {
  it('mounts site for any viewer and connection only when canEdit', () => {
    const site = {
      kind: 'site' as const,
      siteId: 49,
      signatureId: 'GAS-001',
    };
    const connection = {
      kind: 'connection' as const,
      connectionId: 'connection-1' as Id<'mapConnections'>,
      signatureId: null,
    };

    expect(scannerPanelBodyKind(site, false)).toBe('site');
    expect(scannerPanelBodyKind(site, true)).toBe('site');
    expect(scannerPanelBodyKind(connection, true)).toBe('connection');
    expect(scannerPanelBodyKind(connection, false)).toBeNull();
    expect(scannerPanelBodyKind(null, true)).toBeNull();
  });
});
