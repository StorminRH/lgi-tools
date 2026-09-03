'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { authClient } from '@/platform/auth/auth-client';
import { EVE_AUTHORIZED_APPS_URL } from '@/platform/auth/eve-sso-constants';

const REDIRECT_SECONDS = 10;

export function RevokeRedirectLightbox({ open }: { open: boolean }) {
  const labelId = useId();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const handedOff = useRef(false);

  function handoff() {
    if (handedOff.current) return;
    handedOff.current = true;

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
        <p id={labelId} className="text-label uppercase tracking-wide text-tone-red">
          Account data removed
        </p>

        <p className="text-body leading-relaxed text-text">
          Your data has been cleared and LGI.tools can no longer access your EVE data. We’re sending
          you to EVE’s authorized-apps page so you can confirm the access is gone — you’ll land here
          signed out.
        </p>

        <p className="text-ui text-muted">Redirecting in {seconds}s…</p>

        <Button
          variant="bare"
          type="button"
          onClick={handoff}
          className="self-start text-label uppercase tracking-wide text-tone-blue hover:underline"
        >
          Go now
        </Button>

      </div>

    </Dialog>

  );
}
