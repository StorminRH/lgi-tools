import { describe, expect, it } from 'vitest';
import {
  DOWNTIME_FAILURE_GAP_MS,
  downtimeEndsAt,
  haltOf,
  inDowntimeWindow,
  isHalted,
  NO_HALT,
  noteStatusOutcome,
} from './downtime';

const at = (clock: string) => Date.parse(`2026-10-12T${clock}Z`);
const HALF_PAST_ELEVEN = at('11:30:00');

describe('inDowntimeWindow', () => {
  it.each([
    ['10:54:59', false],
    ['10:55:00', true],
    ['11:29:59', true],
    ['11:30:00', false],
    ['03:00:00', false],
  ])('at %s UTC is %s', (clock, inside) => {
    expect(inDowntimeWindow(at(clock))).toBe(inside);
  });

  it('ends the halt at 11:30 UTC of the same day', () => {
    expect(downtimeEndsAt(at('11:02:17'))).toBe(HALF_PAST_ELEVEN);
  });
});

describe('noteStatusOutcome', () => {
  it('halts until 11:30 after two downtime failures at least 25 s apart', () => {
    const first = noteStatusOutcome(NO_HALT, 'down', at('11:00:00'));
    expect(first).toEqual({ failures: [at('11:00:00')], haltUntil: null });

    const tooSoon = noteStatusOutcome(first, 'down', at('11:00:00') + DOWNTIME_FAILURE_GAP_MS - 1);
    expect(tooSoon.haltUntil).toBeNull();
    expect(tooSoon.failures).toHaveLength(2);

    const halted = noteStatusOutcome(first, 'down', at('11:00:00') + DOWNTIME_FAILURE_GAP_MS);
    expect(halted).toEqual({ failures: [at('11:00:00'), at('11:00:25')], haltUntil: HALF_PAST_ELEVEN });
    expect(isHalted(halted, at('11:20:00'))).toBe(true);
    expect(isHalted(halted, HALF_PAST_ELEVEN)).toBe(false);
  });

  it('keeps a halt already set and does not count more failures against it', () => {
    const halted = { failures: [at('11:00:00'), at('11:00:30')], haltUntil: HALF_PAST_ELEVEN };
    expect(noteStatusOutcome(halted, 'down', at('11:10:00'))).toEqual(halted);
    expect(noteStatusOutcome(halted, 'answered', at('11:10:00'))).toEqual({ failures: [], haltUntil: HALF_PAST_ELEVEN });
  });

  it('resets the streak on an answer or on a failure that is not a 503 or 504', () => {
    const first = noteStatusOutcome(NO_HALT, 'down', at('11:00:00'));
    expect(noteStatusOutcome(first, 'failed', at('11:00:30'))).toEqual(NO_HALT);
    expect(noteStatusOutcome(first, 'answered', at('11:00:30'))).toEqual(NO_HALT);
    const restarted = noteStatusOutcome(noteStatusOutcome(first, 'failed', at('11:00:30')), 'down', at('11:01:00'));
    expect(restarted).toEqual({ failures: [at('11:01:00')], haltUntil: null });
  });

  it('never halts outside the window, however many failures there are', () => {
    let halt = NO_HALT;
    for (const clock of ['10:50:00', '10:52:00', '10:54:59']) halt = noteStatusOutcome(halt, 'down', at(clock));
    expect(halt).toEqual(NO_HALT);
    halt = noteStatusOutcome({ failures: [at('11:29:00')], haltUntil: null }, 'down', at('11:30:00'));
    expect(halt).toEqual(NO_HALT);
  });

  it('drops a halt that has run out', () => {
    const halted = { failures: [at('11:00:00'), at('11:00:30')], haltUntil: HALF_PAST_ELEVEN };
    expect(noteStatusOutcome(halted, 'answered', at('11:31:00'))).toEqual(NO_HALT);
  });
});

describe('haltOf', () => {
  it('reads the halt a status row body carries and tolerates anything else', () => {
    expect(haltOf({ status: { state: 'offline' }, halt: { failures: [1, 2], haltUntil: 3 } })).toEqual({ failures: [1, 2], haltUntil: 3 });
    expect(haltOf({ halt: { failures: ['x', 4], haltUntil: 'soon' } })).toEqual({ failures: [4], haltUntil: null });
    expect(haltOf({ players: 3 })).toEqual(NO_HALT);
    expect(haltOf({ halt: null })).toEqual(NO_HALT);
    expect(haltOf(null)).toEqual(NO_HALT);
    expect(haltOf(undefined)).toEqual(NO_HALT);
  });
});
