'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { authClient } from '../auth-client';
import { EVE_AUTHORIZED_APPS_URL } from '../eve-sso-constants';

// The D-5 redirect lightbox. Shown ONLY when a destructive action emptied the
// account — a last-character purge or a full delete — never on a one-of-many purge
// (the server already per-token-revoked just that character; the siblings' EVE
// grant is untouched). Because the user row is gone server-side, the session is
// invalid: this counts down, clears the local cookie via signOut, then hands the
// browser off to EVE's authorized-apps page so the pilot can confirm the grant is
// gone and lands signed out. Non-dismissable (no onOpenChange) — the account is
// already gone, there's nothing to return to.

const REDIRECT_SECONDS = 10;

/** Explains an EVE authorization revocation redirect and returns the user to account reconnection controls. */
export function RevokeRedirectLightbox({ open }: { open: boolean }) {
  const labelId = useId();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const handedOff = useRef(false);

  function handoff() {
    if (handedOff.current) return;
    handedOff.current = true;
    // Clear the orphaned local cookie, then hard-navigate (the LoginButton idiom)
    // so cached server output that referenced the now-gone session is dropped.
    void authClient.signOut().finally(() => {
      window.location.href = EVE_AUTHORIZED_APPS_URL;
    });
  }

  useEffect(() => {
    if (!open) return;
    if (seconds <= 0) {
      handoff();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [open, seconds]);

  return (
    <Dialog open={open} labelledBy={labelId}>
      <div className="flex max-w-[420px] flex-col gap-3 p-5">
        <p id={labelId} className="font-mono text-label uppercase tracking-wide text-tone-red">
          Account data removed
        </p>
        <p className="text-body leading-relaxed text-text">
          Your data has been cleared and LGI.tools can no longer access your EVE data. We’re sending
          you to EVE’s authorized-apps page so you can confirm the access is gone — you’ll land here
          signed out.
        </p>
        <p className="text-ui text-muted">Redirecting in {seconds}s…</p>
        <button
          type="button"
          onClick={handoff}
          className="self-start text-label uppercase tracking-wide text-tone-blue hover:underline"
        >
          Go now
        </button>
      </div>
    </Dialog>
  );
}
