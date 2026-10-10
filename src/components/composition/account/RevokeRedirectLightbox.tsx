'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { inlineLink } from '@/components/ui/text-link';
import { authClient } from '@/platform/auth/auth-client';
import { EVE_AUTHORIZED_APPS_URL } from '@/platform/auth/eve-sso-constants';
import { forgetSignedInBrowser } from '@/platform/auth/reload-document-home';

const REDIRECT_SECONDS = 10;

export function RevokeRedirectLightbox({ open }: { open: boolean }) {
  const labelId = useId();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const handedOff = useRef(false);

  function handoff() {
    if (handedOff.current) return;
    handedOff.current = true;
    void authClient.signOut().finally(() => {
      forgetSignedInBrowser();
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
        <DialogTitle id={labelId} className="text-label uppercase tracking-wide text-tone-red">
          Account data removed
        </DialogTitle>
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
          className={`${inlineLink} self-start text-label uppercase tracking-wide`}
        >
          Go now
        </Button>
      </div>
    </Dialog>
  );
}
