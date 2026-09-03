'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const resolveAfkConfig = () =>
  afkConfigFromOverrides(
    process.env.NEXT_PUBLIC_AFK_HIDDEN_AFTER_MS,
    process.env.NEXT_PUBLIC_AFK_PROMPT_TIMEOUT_MS,
  );

export interface AfkGateState {
  paused: boolean;
  promptOpen: boolean;
  dismiss: () => void;
}

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

  const paused = isAfkPaused(state);
  const promptOpen = isAfkPromptOpen(state);
  const dismiss = useCallback(
    () => setState(onAfkDismiss(document.visibilityState === 'visible', Date.now())),
    [],
  );
  return useMemo(() => ({ paused, promptOpen, dismiss }), [paused, promptOpen, dismiss]);
}

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
