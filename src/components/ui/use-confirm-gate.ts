import { useReducer } from 'react';

type ConfirmPhase = 'idle' | 'confirming' | 'running';

interface ConfirmState<T> {
  readonly phase: ConfirmPhase;
  /** The last requested target. Cancel and reset keep it, so a closing dialog still names it. */
  readonly target: T | null;
  /** The last run failed, until the next request or run. */
  readonly errored: boolean;
}

type ConfirmEvent<T> =
  | { readonly type: 'request'; readonly target: T }
  | { readonly type: 'cancel' }
  | { readonly type: 'confirm' }
  | { readonly type: 'fail' }
  | { readonly type: 'reset' };

const IDLE: ConfirmState<never> = { phase: 'idle', target: null, errored: false };

/** Nothing interrupts a run: request and cancel wait until it fails or the caller resets. */
function confirmGateReducer<T>(state: ConfirmState<T>, event: ConfirmEvent<T>): ConfirmState<T> {
  switch (event.type) {
    case 'request':
      return state.phase === 'running'
        ? state
        : { phase: 'confirming', target: event.target, errored: false };
    case 'cancel':
      return state.phase === 'confirming' ? { ...state, phase: 'idle' } : state;
    case 'confirm':
      return state.phase === 'confirming' ? { ...state, phase: 'running', errored: false } : state;
    case 'fail':
      return state.phase === 'running' ? { ...state, phase: 'confirming', errored: true } : state;
    case 'reset':
      return state.phase === 'idle' ? state : { ...state, phase: 'idle' };
  }
}

/**
 * The open, busy and retry state of a ConfirmDialog, with the target it was
 * opened for. The target outlives the close, so the dialog's consequence keeps
 * naming it through the exit transition instead of going blank.
 *
 * `run` holds the dialog busy while `action` runs. When `failed(outcome)`
 * holds, the dialog returns to confirming with `errored` set, for a retry or a
 * cancel; otherwise it stays busy until the caller resets or navigates away.
 * Callers that run their write elsewhere call `reset` after confirming.
 */
export function useConfirmGate<T = void>() {
  const [state, dispatch] = useReducer(confirmGateReducer<T>, IDLE);
  return {
    open: state.phase !== 'idle',
    busy: state.phase === 'running',
    errored: state.errored,
    target: state.target,
    request: (target: T) => dispatch({ type: 'request', target }),
    cancel: () => dispatch({ type: 'cancel' }),
    reset: () => dispatch({ type: 'reset' }),
    async run<R>(action: () => Promise<R>, failed: (outcome: R) => boolean): Promise<R> {
      dispatch({ type: 'confirm' });
      const outcome = await action();
      if (failed(outcome)) dispatch({ type: 'fail' });
      return outcome;
    },
  };
}
