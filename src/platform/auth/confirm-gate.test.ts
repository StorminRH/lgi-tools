import { describe, expect, it } from 'vitest';
import {
  type ConfirmEvent,
  type ConfirmPhase,
  confirmGateReducer,
  INITIAL_CONFIRM_PHASE,
} from './confirm-gate';

function run(events: ConfirmEvent[], from: ConfirmPhase = INITIAL_CONFIRM_PHASE): ConfirmPhase {
  return events.reduce(confirmGateReducer, from);
}

describe('confirmGateReducer', () => {
  it('opens to confirming without running, and only confirm from that phase starts the call', () => {

    expect(run([{ type: 'request' }])).toBe('confirming');
    expect(run([{ type: 'request' }, { type: 'request' }])).toBe('confirming');
    expect(run([{ type: 'request' }, { type: 'confirm' }])).toBe('running');
    expect(run([{ type: 'confirm' }])).toBe('idle');
  });

  it('cancels back to idle, ignores cancel/request while running, and retries after fail', () => {
    expect(run([{ type: 'request' }, { type: 'cancel' }])).toBe('idle');

    const running = run([{ type: 'request' }, { type: 'confirm' }]);
    expect(running).toBe('running');
    expect(confirmGateReducer(running, { type: 'cancel' })).toBe('running');
    expect(confirmGateReducer(running, { type: 'request' })).toBe('running');

    const afterFail = run([{ type: 'request' }, { type: 'confirm' }, { type: 'fail' }]);
    expect(afterFail).toBe('confirming');
    expect(confirmGateReducer(afterFail, { type: 'confirm' })).toBe('running');
    expect(run([{ type: 'fail' }])).toBe('idle');
    expect(run([{ type: 'request' }, { type: 'fail' }])).toBe('confirming');
  });

  it('reset always returns to idle', () => {
    expect(run([{ type: 'request' }, { type: 'confirm' }, { type: 'reset' }])).toBe('idle');
    expect(confirmGateReducer('confirming', { type: 'reset' })).toBe('idle');
  });
});
