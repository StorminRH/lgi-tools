'use client';

import { type ReactNode, type RefObject, useId, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { SectionHeader } from '@/components/ui/section-header';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import {
  isDeleteAcknowledged,
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from '../account-actions';
import { authClient } from '../auth-client';
import { confirmGateReducer, INITIAL_CONFIRM_PHASE } from '../confirm-gate';
import { RevokeRedirectLightbox } from './RevokeRedirectLightbox';

// The /characters "Danger zone" (ACCOUNT.2.2) — the destructive account controls,
// quarantined below the roster and kept visually apart from the reversible Unlink
// (which stays on the roster). It hosts a per-character Purge (the new scrub +
// EVE-revoke action, distinct from unlink), an account Delete (strongest confirm),
// and Log-out-everywhere. All three sit behind confirm gates; the decision logic
// lives in tested helpers (account-actions / confirm-gate), this file is the shell.
// A single D-5 lightbox is shown when any purge empties the account or a delete
// succeeds.
export function AccountDangerZone({
  characters,
}: {
  characters: { characterId: number; name: string }[];
}) {
  const [emptied, setEmptied] = useState(false);
  const onEmptied = () => setEmptied(true);

  return (
    <Card>
      <SectionHeader
        size="md"
        label={<span className="text-ui text-tone-red">Danger zone</span>}
        hint={
          <Popover
            label="What purge and unlink do"
            trigger="?"
            triggerClassName="grid h-4 w-4 place-items-center rounded-full border border-border text-micro text-muted hover:text-text"
          >
            <PopoverHeading>Purge vs unlink</PopoverHeading>
            <PopoverRow label="Purge">
              clears what the site has stored for a character and stops LGI.tools from accessing its
              EVE data.
            </PopoverRow>
            <PopoverRow label="Unlink">
              just detaches the character (on the roster above) — you can link it again later.
            </PopoverRow>
          </Popover>
        }
      />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        <div className="flex flex-col gap-2.5">
          <p className="text-ui leading-relaxed text-muted">
            Purging a character clears what the site has stored for it and stops LGI.tools from
            accessing that character’s EVE data.
          </p>
          {characters.length === 0 ? (
            <EmptyState>No characters to purge.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {characters.map((c) => (
                <li key={c.characterId}>
                  <PurgeCharacterControl
                    characterId={c.characterId}
                    characterName={c.name}
                    isOnlyCharacter={characters.length === 1}
                    onEmptied={onEmptied}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border-soft pt-3.5">
          <LogoutEverywhereControl />
          <DeleteAccountControl onEmptied={onEmptied} />
        </div>
      </div>

      <RevokeRedirectLightbox open={emptied} />
    </Card>
  );
}

// The shared confirm-gate plumbing for a destructive control: the gate phase, the
// open/busy derivations, an error flag, and a `run` that fires a confirmed action
// (dispatch confirm → await → fail+toast on a `{kind:'error'}` outcome, leaving the
// dialog open for retry). The control owns what success means. Returns only plain
// values + callbacks — the trigger ref / label id stay in the component (the React
// Compiler treats a hook that returns a ref as ref-tainting every member access).
function useConfirmGate() {
  const [phase, dispatch] = useReducer(confirmGateReducer, INITIAL_CONFIRM_PHASE);
  const [errored, setErrored] = useState(false);

  function request() {
    setErrored(false);
    dispatch({ type: 'request' });
  }

  async function run<T extends { kind: string }>(
    action: () => Promise<T>,
    errorToast: string,
  ): Promise<T> {
    setErrored(false);
    dispatch({ type: 'confirm' });
    const outcome = await action();
    if (outcome.kind === 'error') {
      dispatch({ type: 'fail' });
      setErrored(true);
      toast.error(errorToast);
    }
    return outcome;
  }

  return {
    errored,
    open: phase !== 'idle',
    busy: phase === 'running',
    request,
    cancel: () => dispatch({ type: 'cancel' }),
    reset: () => dispatch({ type: 'reset' }),
    run,
  };
}

type Gate = ReturnType<typeof useConfirmGate>;

// The confirm dialog shell, driven by a gate. Escape / outside-press funnel to the
// gate's cancel (a no-op while the call is running, so the dialog can't close
// mid-flight). The body (copy + any extra controls + footer) is the children.
function ConfirmDialog({
  gate,
  labelId,
  triggerRef,
  className,
  children,
}: {
  gate: Gate;
  labelId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={gate.open}
      onOpenChange={(next) => {
        if (!next) gate.cancel();
      }}
      labelledBy={labelId}
      finalFocus={triggerRef}
    >
      <div className={`flex flex-col gap-3 p-4 ${className ?? ''}`}>{children}</div>
    </Dialog>
  );
}

// The destructive confirm footer: a Cancel close + the confirm button (disabled
// while the call is in flight). `confirmClassName` lets the neutral log-out action
// use text colour instead of red.
function ConfirmFooter({
  busy,
  disabled,
  confirmLabel,
  busyLabel,
  onConfirm,
  confirmClassName = 'text-tone-red',
}: {
  busy: boolean;
  disabled?: boolean;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => void;
  confirmClassName?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <DialogClose
        disabled={busy}
        className="text-label uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
      >
        Cancel
      </DialogClose>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled ?? busy}
        className={`text-label uppercase tracking-[0.12em] hover:underline disabled:text-muted ${confirmClassName}`}
      >
        {busy ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}

// A red destructive trigger button (Purge / Delete) that opens its gate's dialog.
function DangerButton({
  triggerRef,
  onClick,
  label,
  className = '',
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      ref={triggerRef}
      variant="danger"
      size="sm"
      onClick={onClick}
      className={`shrink-0 ${className}`}
    >
      {label}
    </Button>
  );
}

function PurgeCharacterControl({
  characterId,
  characterName,
  isOnlyCharacter,
  onEmptied,
}: {
  characterId: number;
  characterName: string;
  isOnlyCharacter: boolean;
  onEmptied: () => void;
}) {
  const router = useRouter();
  const gate = useConfirmGate();
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(
      () => runPurgeCharacter(characterId, apiFetch),
      `Could not purge ${characterName}`,
    );
    if (outcome.kind === 'emptied') {
      gate.reset(); // close this dialog; the D-5 lightbox takes over
      onEmptied();
    } else if (outcome.kind === 'stayed') {
      // The account still has other characters — refresh the roster in place.
      gate.reset();
      toast.success(`${characterName}’s data was purged`);
      router.refresh();
    }
    // 'error' is handled inside gate.run (dialog stays open for retry).
  }

  return (
    <div className="flex items-center justify-between gap-2 border border-border bg-section px-3 py-2">
      <span className="min-w-0 truncate font-mono text-ui text-text">{characterName}</span>
      <DangerButton triggerRef={triggerRef} onClick={gate.request} label="Purge" />
      <ConfirmDialog gate={gate} labelId={labelId} triggerRef={triggerRef} className="max-w-[380px]">
        <p id={labelId} className="text-body text-text">
          {isOnlyCharacter ? (
            <>
              Purge {characterName}? This is your only character, so this also deletes your account —
              all of your saved data will be lost.
            </>
          ) : (
            <>
              Purge {characterName}? This clears the data the site has stored for this character and
              stops LGI.tools from accessing its EVE data.
            </>
          )}
        </p>
        {gate.errored ? (
          <p className="text-ui text-tone-red">Something went wrong. Please try again.</p>
        ) : null}
        <ConfirmFooter
          busy={gate.busy}
          confirmLabel="Purge character"
          busyLabel="Purging…"
          onConfirm={() => void onConfirm()}
        />
      </ConfirmDialog>
    </div>
  );
}

function LogoutEverywhereControl() {
  const gate = useConfirmGate();
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(
      () => runLogoutEverywhere(apiFetch),
      'Could not sign out everywhere',
    );
    if (outcome.kind === 'done') {
      // Revoke killed this session too — clear the local cookie, then land home signed out.
      const target = redirectTargetFor(outcome) ?? '/';
      void authClient.signOut().finally(() => {
        window.location.href = target;
      });
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-ui text-text">Log out everywhere</p>
        <p className="text-ui text-muted">Ends every active session, including this device.</p>
      </div>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={gate.request}
        className="shrink-0"
      >
        Log out everywhere
      </Button>
      <ConfirmDialog gate={gate} labelId={labelId} triggerRef={triggerRef} className="max-w-[380px]">
        <p id={labelId} className="text-body text-text">
          Sign out on every device, including this one? You’ll need to sign in again here afterward.
        </p>
        {gate.errored ? (
          <p className="text-ui text-tone-red">Something went wrong. Please try again.</p>
        ) : null}
        <ConfirmFooter
          busy={gate.busy}
          confirmLabel="Sign out everywhere"
          busyLabel="Signing out…"
          onConfirm={() => void onConfirm()}
          confirmClassName="text-text"
        />
      </ConfirmDialog>
    </div>
  );
}

function DeleteAccountControl({ onEmptied }: { onEmptied: () => void }) {
  const gate = useConfirmGate();
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const canConfirm = isDeleteAcknowledged(acknowledged) && !gate.busy;

  function openDialog() {
    setAcknowledged(false);
    gate.request();
  }

  async function onConfirm() {
    if (!isDeleteAcknowledged(acknowledged)) return;
    const outcome = await gate.run(() => runDeleteAccount(apiFetch), 'Could not delete your account');
    if (outcome.kind === 'emptied') {
      gate.reset();
      onEmptied();
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-ui text-text">Delete account</p>
        <p className="text-ui text-muted">
          Permanently removes your account and every character’s data.
        </p>
      </div>
      <DangerButton triggerRef={triggerRef} onClick={openDialog} label="Delete" className="px-2.5" />
      <ConfirmDialog gate={gate} labelId={labelId} triggerRef={triggerRef} className="max-w-[400px]">
        <p id={labelId} className="text-body text-text">
          Are you sure you want to do this? All of your saved data will be lost.
        </p>
        <label className="flex items-start gap-2 text-ui text-text">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={gate.busy}
            className="mt-0.5 h-3.5 w-3.5 accent-tone-red"
          />
          <span>I understand my account and all of my saved data will be lost.</span>
        </label>
        {gate.errored ? (
          <p className="text-ui text-tone-red">Something went wrong. Please try again.</p>
        ) : null}
        <ConfirmFooter
          busy={gate.busy}
          disabled={!canConfirm}
          confirmLabel="Delete account"
          busyLabel="Deleting…"
          onConfirm={() => void onConfirm()}
        />
      </ConfirmDialog>
    </div>
  );
}
