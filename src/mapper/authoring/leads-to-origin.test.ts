import { describe, expect, it, vi } from 'vitest';
import {
  decodeOriginLead,
  dispatchLeadsToChange,
  encodeOriginLead,
  originLeadCandidates,
  originLeadForSystem,
  type OriginLeadConnection,
} from './leads-to-origin';

const STUB_SYSTEM = 31_000_001;
const ORIGIN_SYSTEM = 31_000_002;
const OTHER_SYSTEM = 31_000_003;

function line(
  overrides: Partial<OriginLeadConnection> & { connectionId: string },
): OriginLeadConnection {
  return {
    fromSystemId: ORIGIN_SYSTEM,
    toSystemId: STUB_SYSTEM,
    fromSignatureId: null,
    toSignatureId: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('origin lead encoding', () => {
  it('round-trips a connection id and ignores class hints', () => {
    expect(encodeOriginLead('conn-1')).toBe('origin:conn-1');
    expect(decodeOriginLead('origin:conn-1')).toBe('conn-1');
    expect(decodeOriginLead('hisec')).toBeNull();
    expect(decodeOriginLead(null)).toBeNull();
    expect(decodeOriginLead('origin:')).toBeNull();
  });

  it('routes an origin pick to link and a class hint to setLeadsTo', () => {
    const onLinkOrigin = vi.fn();
    const onChangeHint = vi.fn();
    dispatchLeadsToChange('origin:inbound-1', onLinkOrigin, onChangeHint);
    expect(onLinkOrigin).toHaveBeenCalledWith('inbound-1');
    expect(onChangeHint).not.toHaveBeenCalled();
    onLinkOrigin.mockClear();
    dispatchLeadsToChange('unknown', onLinkOrigin, onChangeHint);
    expect(onChangeHint).toHaveBeenCalledWith('unknown');
    expect(onLinkOrigin).not.toHaveBeenCalled();
    onChangeHint.mockClear();
    dispatchLeadsToChange(null, onLinkOrigin, onChangeHint);
    expect(onChangeHint).toHaveBeenCalledWith(null);
    expect(onLinkOrigin).not.toHaveBeenCalled();
  });
});

describe('originLeadCandidates', () => {
  it('offers a sig-less inbound whose other end is a live system', () => {
    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({ connectionId: 'inbound' }),
      ]),
    ).toEqual([{ connectionId: 'inbound', systemId: ORIGIN_SYSTEM }]);
  });

  it('skips the stub itself, tombstones, unresolved rows, and already-linked sides', () => {
    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({ connectionId: 'stub-1', fromSystemId: STUB_SYSTEM, toSystemId: null }),
        line({ connectionId: 'dead', deletedAt: 1 }),
        line({ connectionId: 'ghost', toSystemId: null, fromSystemId: STUB_SYSTEM }),
        line({ connectionId: 'linked', toSignatureId: 'ABC-123' }),
        line({
          connectionId: 'elsewhere',
          fromSystemId: ORIGIN_SYSTEM,
          toSystemId: OTHER_SYSTEM,
        }),
      ]),
    ).toEqual([]);
  });

  it('links a return-system pick only when exactly one inbound matches', () => {
    const inbound = { connectionId: 'inbound', systemId: ORIGIN_SYSTEM };
    expect(originLeadForSystem(ORIGIN_SYSTEM, [inbound])).toBe('inbound');
    expect(originLeadForSystem(OTHER_SYSTEM, [inbound])).toBeNull();
    expect(
      originLeadForSystem(ORIGIN_SYSTEM, [
        inbound,
        { connectionId: 'other', systemId: ORIGIN_SYSTEM },
      ]),
    ).toBeNull();
  });

  it('reads the origin from either endpoint orientation', () => {
    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({
          connectionId: 'from-here',
          fromSystemId: STUB_SYSTEM,
          toSystemId: ORIGIN_SYSTEM,
          fromSignatureId: null,
        }),
      ]),
    ).toEqual([{ connectionId: 'from-here', systemId: ORIGIN_SYSTEM }]);
  });
});
