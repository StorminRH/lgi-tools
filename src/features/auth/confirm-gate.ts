// The confirm-gate state machine shared by the account page's destructive
// controls (per-character purge / account delete / log-out-everywhere). Its whole
// job is the D-3 guarantee: a destructive call NEVER fires on the open click — the
// ONLY transition into `running` (the phase a consumer watches to dispatch the
// real call) is a `confirm` from `confirming`. A pure reducer so that guarantee is
// unit-tested with no React and no DOM (the Humble-Component split — the thin
// dialog shell stays for visual/ux-check review).

export type ConfirmPhase = 'idle' | 'confirming' | 'running';

export type ConfirmEvent =
  | { type: 'request' } // open the confirm dialog
  | { type: 'cancel' } // dismiss without acting
  | { type: 'confirm' } // the user confirmed — start the call
  | { type: 'fail' } // the call errored — reopen for retry (the control holds the message)
  | { type: 'reset' }; // back to idle (success closes the dialog / the page redirects)

export const INITIAL_CONFIRM_PHASE: ConfirmPhase = 'idle';

export function confirmGateReducer(phase: ConfirmPhase, event: ConfirmEvent): ConfirmPhase {
  switch (event.type) {
    case 'request':
      // Opening shows the dialog; it NEVER starts the call. A request mid-flight is
      // ignored so a double-trigger can't reopen over a running call.
      return phase === 'running' ? phase : 'confirming';
    case 'cancel':
      // Dismissing is a no-op once the call is in flight (the dialog stays up).
      return phase === 'running' ? phase : 'idle';
    case 'confirm':
      // The one and only path into `running`. Guarded to `confirming` so a stray
      // confirm outside the open dialog can't fire the destructive call.
      return phase === 'confirming' ? 'running' : phase;
    case 'fail':
      // The call errored — drop back to the open confirm dialog so the user can
      // retry. Only meaningful from a running call.
      return phase === 'running' ? 'confirming' : phase;
    case 'reset':
      return 'idle';
  }
}
