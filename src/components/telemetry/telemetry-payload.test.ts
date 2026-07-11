import { describe, expect, it } from 'vitest';
import { buildTelemetryPayload } from './telemetry-payload';

describe('buildTelemetryPayload', () => {
  it('passes provided metadata through unchanged', () => {
    expect(buildTelemetryPayload({ action: 'terminal_search', metadata: { query: 'jita' } })).toEqual({
      action: 'terminal_search',
      metadata: { query: 'jita' },
    });
  });

  it('normalizes absent metadata to an empty object', () => {
    expect(buildTelemetryPayload({ action: 'page_view' })).toEqual({
      action: 'page_view',
      metadata: {},
    });
  });
});
