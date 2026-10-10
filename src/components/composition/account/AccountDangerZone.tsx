'use client';

import { cn } from '@/components/ui/cn';
import { type RefObject, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { insetSurface } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpPopover } from '@/components/ui/help-popover';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { SectionPanel } from '@/components/ui/section-panel';
import { inlineLink } from '@/components/ui/text-link';
import { toast } from '@/components/ui/toast';
import { useConfirmGate } from '@/components/ui/use-confirm-gate';
import { apiFetch } from '@/transport/api-client';
import {
  isDeleteAcknowledged,
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from '@/platform/auth/account-actions';
import { authClient } from '@/platform/auth/auth-client';
import { forgetSignedInBrowser } from '@/platform/auth/reload-document-home';
import { RevokeRedirectLightbox } from './RevokeRedirectLightbox';

export function AccountDangerZone({
  characters,
  className,
}: {
  characters: { characterId: number; name: string }[];
  className?: string;
}) {
  const [emptied, setEmptied] = useState(false);
  const onEmptied = () => setEmptied(true);

  return (
    <SectionPanel
      title={<span className="text-ui text-tone-red">Danger zone</span>}
      meta={
        <HelpPopover label="What purge and unlink do">
          <PopoverHeading>Purge vs unlink</PopoverHeading>
          <PopoverRow layout="description" label="Purge">
            clears what the site has stored for a character and stops LGI.tools from accessing its
            EVE data.
          </PopoverRow>
          <PopoverRow layout="description" label="Unlink">
            detaches the character from your account. Unlink characters on{' '}
            <Link href="/settings/characters" className={inlineLink}>
              Settings → Characters
            </Link>
            . You can link them again later.
          </PopoverRow>
        </HelpPopover>
      }
      className={className}
    >
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        <div className="flex flex-col gap-2.5">
          <p className="text-ui leading-relaxed text-muted">
            Purge stored character data and revoke its EVE access.
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
    </SectionPanel>
  );
}

/** An account action that failed; its dialog stays open for a retry. */
function isError(outcome: { kind: string }): boolean {
  return outcome.kind === 'error';
}

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(() => runPurgeCharacter(characterId, apiFetch), isError);
    if (outcome.kind === 'error') {
      toast.error('Purge failed');
    } else if (outcome.kind === 'emptied') {
      gate.reset();
      onEmptied();
    } else if (outcome.kind === 'stayed') {
      gate.reset();
      toast.success('Character data purged');
      router.refresh();
    }
  }

  return (
    <div className={cn(insetSurface, 'flex items-center justify-between gap-2 px-3 py-2')}>
      <span className="min-w-0 truncate font-data text-ui text-text">{characterName}</span>
      <DangerButton triggerRef={triggerRef} onClick={() => gate.request()} label="Purge" />
      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Purge character"
        consequence={isOnlyCharacter ? (
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
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Purge character"
        busyLabel="Purging…"
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        className="w-[min(380px,calc(100vw-2rem))]"
      />
    </div>
  );
}

function LogoutEverywhereControl() {
  const gate = useConfirmGate();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(() => runLogoutEverywhere(apiFetch), isError);
    if (outcome.kind === 'error') {
      toast.error('Sign-out failed');
    } else if (outcome.kind === 'done') {
      const target = redirectTargetFor(outcome) ?? '/';
      void authClient.signOut().finally(() => {
        forgetSignedInBrowser();
        window.location.href = target;
      });
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ui text-text">Log out everywhere</p>
        <p className="text-ui text-muted">Ends every active session, including this device.</p>
      </div>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={() => gate.request()}
        className="shrink-0"
      >
        Log out everywhere
      </Button>
      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Log out everywhere"
        consequence="Sign out on every device, including this one? You’ll need to sign in again here afterward."
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Sign out everywhere"
        busyLabel="Signing out…"
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        tone="neutral"
        className="w-[min(380px,calc(100vw-2rem))]"
      />
    </div>
  );
}

function DeleteAccountControl({ onEmptied }: { onEmptied: () => void }) {
  const gate = useConfirmGate();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const canConfirm = isDeleteAcknowledged(acknowledged) && !gate.busy;

  function openDialog() {
    setAcknowledged(false);
    gate.request();
  }

  async function onConfirm() {
    if (!isDeleteAcknowledged(acknowledged)) return;
    const outcome = await gate.run(() => runDeleteAccount(apiFetch), isError);
    if (outcome.kind === 'error') {
      toast.error('Account deletion failed');
    } else if (outcome.kind === 'emptied') {
      gate.reset();
      onEmptied();
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ui text-text">Delete account</p>
        <p className="text-ui text-muted">
          Permanently removes your account and every character’s data.
        </p>
      </div>
      <DangerButton triggerRef={triggerRef} onClick={openDialog} label="Delete" className="px-2.5" />
      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Delete account"
        consequence="Are you sure you want to do this? All of your saved data will be lost."
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        confirmDisabled={!canConfirm}
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        className="w-[min(400px,calc(100vw-2rem))]"
      >
        <Checkbox
          checked={acknowledged}
          onCheckedChange={setAcknowledged}
          tone="red"
          disabled={gate.busy}
          className="mt-0.5"
          rowClassName="items-start"
        >
          I understand my account and all of my saved data will be lost.
        </Checkbox>
      </ConfirmDialog>
    </div>
  );
}
