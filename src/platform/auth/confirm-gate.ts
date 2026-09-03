export type ConfirmPhase = 'idle' | 'confirming' | 'running';

export type ConfirmEvent =
  | { type: 'request' }
  | { type: 'cancel' }
  | { type: 'confirm' }
  | { type: 'fail' }
  | { type: 'reset' };

export const INITIAL_CONFIRM_PHASE: ConfirmPhase = 'idle';

export function confirmGateReducer(phase: ConfirmPhase, event: ConfirmEvent): ConfirmPhase {
  switch (event.type) {
    case 'request':

      return phase === 'running' ? phase : 'confirming';
    case 'cancel':

      return phase === 'running' ? phase : 'idle';
    case 'confirm':

      return phase === 'confirming' ? 'running' : phase;
    case 'fail':

      return phase === 'running' ? 'confirming' : phase;
    case 'reset':
      return 'idle';
  }
}
