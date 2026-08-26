import { describe, expect, it, vi } from 'vitest';
import {
  decodeOriginLead,
  dispatchLeadsToChange,
  encodeOriginLead,
  originLeadCandidates,
  originLeadForSystem,
  originLeadForTypedLabel,
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
    from: { signatureId: null },
    to: { signatureId: null },
    tombstone: { kind: 'live' },
    ...overrides,
  };
}

describe('origin lead encoding', () => {
  it('round-trips origin leads and routes picks to link vs setLeadsTo', () => {
    expect(encodeOriginLead('conn-1')).toBe('origin:conn-1');
    expect(decodeOriginLead('origin:conn-1')).toBe('conn-1');
    expect(decodeOriginLead('hisec')).toBeNull();
    expect(decodeOriginLead(null)).toBeNull();
    expect(decodeOriginLead('origin:')).toBeNull();

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
  it('offers live inbounds from either orientation, including occupied mouths, and skips stubs, tombs, and unrelated systems', () => {
    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({ connectionId: 'inbound' }),
      ]),
    ).toEqual([{ connectionId: 'inbound', systemId: ORIGIN_SYSTEM }]);

    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({
          connectionId: 'from-here',
          fromSystemId: STUB_SYSTEM,
          toSystemId: ORIGIN_SYSTEM,
          from: { signatureId: null },
        }),
      ]),
    ).toEqual([{ connectionId: 'from-here', systemId: ORIGIN_SYSTEM }]);

    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-2', [
        line({ connectionId: 'linked', to: { signatureId: 'ABC-123' } }),
      ]),
    ).toEqual([{ connectionId: 'linked', systemId: ORIGIN_SYSTEM }]);

    expect(
      originLeadCandidates(STUB_SYSTEM, 'stub-1', [
        line({ connectionId: 'stub-1', fromSystemId: STUB_SYSTEM, toSystemId: null }),
        line({
          connectionId: 'dead',
          tombstone: { kind: 'removed', deletedAt: 1, purgeAfter: null },
        }),
        line({ connectionId: 'ghost', toSystemId: null, fromSystemId: STUB_SYSTEM }),
        line({
          connectionId: 'elsewhere',
          fromSystemId: ORIGIN_SYSTEM,
          toSystemId: OTHER_SYSTEM,
        }),
      ]),
    ).toEqual([]);
  });

  it('links a return-system pick or typed label only when exactly one inbound matches', () => {
    const inbound = { connectionId: 'inbound', systemId: ORIGIN_SYSTEM };
    expect(originLeadForSystem(ORIGIN_SYSTEM, [inbound])).toBe('inbound');
    expect(originLeadForSystem(OTHER_SYSTEM, [inbound])).toBeNull();
    expect(
      originLeadForSystem(ORIGIN_SYSTEM, [
        inbound,
        { connectionId: 'other', systemId: ORIGIN_SYSTEM },
      ]),
    ).toBeNull();

    const labeled = { connectionId: 'inbound', label: 'J160650 - C3' };
    expect(originLeadForTypedLabel('J160650', [labeled])).toBe('inbound');
    expect(originLeadForTypedLabel('Jita', [labeled])).toBeNull();
    expect(
      originLeadForTypedLabel('J160650', [
        labeled,
        { connectionId: 'other', label: 'J160650 - C3' },
      ]),
    ).toBeNull();
  });
});
