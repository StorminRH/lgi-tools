'use client';

// The Atlas AFK gate: hidden tabs keep heartbeating (heartbeat-loop.ts), so
// "tab hidden" no longer ends tracking — this is the human check that does.
// After an hour continuously hidden the modal below appears (typically first
// SEEN when the player alt-tabs back — it waits for them); five unanswered
// minutes later the caller stops heartbeating (afk-model.ts owns those
// transitions, pure and unit-tested; this file is the thin timer/DOM/dialog
// wiring). Dismissing the dialog — Continue, Escape, or a backdrop press —
// resumes tracking instantly via the caller's next mount beat.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AFK_TICK_MS,
  afkConfigFromOverrides,
  initialAfkState,
  isAfkPaused,
  isAfkPromptOpen,
  onAfkDismiss,
  onAfkTick,
  onAfkVisibilityChange,
} from './afk-model';

const TITLE_ID = 'atlas-afk-title';

// Dev/manual-testing override only (NEXT_PUBLIC_* access is the sanctioned
// direct-env exception); absent or invalid values fall back to the production
// thresholds inside afkConfigFromOverrides.
const resolveAfkConfig = () =>
  afkConfigFromOverrides(
    process.env.NEXT_PUBLIC_AFK_HIDDEN_AFTER_MS,
    process.env.NEXT_PUBLIC_AFK_PROMPT_TIMEOUT_MS,
  );

/** The AFK machine's live view: whether beats must stop, and the dismiss handle. */
export interface AfkGateState {
  paused: boolean;
  promptOpen: boolean;
  dismiss: () => void;
}

/**
 * Runs the AFK state machine against the real clock and visibility. The tick
 * interval is coarse (30s) and browser-throttled while hidden (~1/min) —
 * both irrelevant at hour/minute thresholds.
 */
export function useAfkState(): AfkGateState {
  const [state, setState] = useState(() =>
    initialAfkState(typeof document === 'undefined' || document.visibilityState === 'visible', Date.now()),
  );

  useEffect(() => {
    const config = resolveAfkConfig();
    const onVisibility = () =>
      setState((s) => onAfkVisibilityChange(s, document.visibilityState === 'visible', Date.now()));
    const timer = setInterval(() => setState((s) => onAfkTick(s, config, Date.now())), AFK_TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return {
    paused: isAfkPaused(state),
    promptOpen: isAfkPromptOpen(state),
    dismiss: () =>
      setState(onAfkDismiss(document.visibilityState === 'visible', Date.now())),
  };
}

/**
 * The AFK check lightbox. Fully controlled by useAfkState; every dismiss
 * affordance (Continue, Escape, backdrop) funnels through onOpenChange and
 * resumes tracking.
 */
export function AfkDialog({ afk }: { readonly afk: AfkGateState }) {
  return (
    <Dialog
      open={afk.promptOpen}
      onOpenChange={(open) => {
        if (!open) afk.dismiss();
      }}
      labelledBy={TITLE_ID}
      className="w-[min(26rem,calc(100vw-2rem))]"
    >
      <DialogTitle
        id={TITLE_ID}
        className="border-b border-border-soft px-4 py-3 font-display text-h3 font-semibold tracking-copy uppercase text-name"
      >
        Still mapping?
      </DialogTitle>
      <div className="flex flex-col gap-3 px-4 py-4" data-afk-dialog>
        <DialogDescription className="font-ui text-ui leading-relaxed text-text">
          {afk.paused
            ? 'It looked like you were AFK, so location tracking is paused. Continue to resume.'
            : 'It looks like you might be AFK. Tracking pauses in a few minutes unless you continue.'}
        </DialogDescription>
      </div>
      <footer className="flex items-center justify-end border-t border-border-soft px-4 py-3">
        <DialogClose render={<Button variant="primary" size="sm" />}>Continue</DialogClose>
      </footer>
    </Dialog>
  );
}
