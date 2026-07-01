import { describe, expect, it } from 'vitest';
import {
  type ConfirmEvent,
  type ConfirmPhase,
  confirmGateReducer,
  INITIAL_CONFIRM_PHASE,
} from './confirm-gate';

// Drive a sequence of events from the initial phase and return the final phase.
function run(events: ConfirmEvent[], from: ConfirmPhase = INITIAL_CONFIRM_PHASE): ConfirmPhase {
  return events.reduce(confirmGateReducer, from);
}

describe('confirmGateReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_CONFIRM_PHASE).toBe('idle');
  });

  it('opening the dialog never reaches running (the gate blocks the call until confirmed)', () => {
    // The D-3 guarantee: a `request` (open) on its own must NOT enter `running`,
    // the phase the consumer uses to dispatch the destructive call.
    expect(run([{ type: 'request' }])).toBe('confirming');
    // Re-requesting still never runs.
    expect(run([{ type: 'request' }, { type: 'request' }])).toBe('confirming');
  });

  it('only a confirm from confirming starts the call', () => {
    expect(run([{ type: 'request' }, { type: 'confirm' }])).toBe('running');
    // A confirm without first opening the dialog is ignored.
    expect(run([{ type: 'confirm' }])).toBe('idle');
  });

  it('cancel from confirming returns to idle', () => {
    expect(run([{ type: 'request' }, { type: 'cancel' }])).toBe('idle');
  });

  it('cancel and request are ignored while the call is running', () => {
    const running = run([{ type: 'request' }, { type: 'confirm' }]);
    expect(running).toBe('running');
    expect(confirmGateReducer(running, { type: 'cancel' })).toBe('running');
    expect(confirmGateReducer(running, { type: 'request' })).toBe('running');
  });

  it('a failed call drops back to confirming and can be retried', () => {
    const afterFail = run([{ type: 'request' }, { type: 'confirm' }, { type: 'fail' }]);
    expect(afterFail).toBe('confirming');
    // The retry still only fires the call on confirm.
    expect(confirmGateReducer(afterFail, { type: 'confirm' })).toBe('running');
  });

  it('fail outside a running call is a no-op', () => {
    expect(run([{ type: 'fail' }])).toBe('idle');
    expect(run([{ type: 'request' }, { type: 'fail' }])).toBe('confirming');
  });

  it('reset always returns to idle', () => {
    expect(run([{ type: 'request' }, { type: 'confirm' }, { type: 'reset' }])).toBe('idle');
    expect(confirmGateReducer('confirming', { type: 'reset' })).toBe('idle');
  });
});
