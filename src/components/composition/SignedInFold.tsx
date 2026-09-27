'use client';

import { useId, type ReactNode } from 'react';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { SIGNED_IN_HINT_KEY } from '@/platform/auth/signed-in-hint';

// Visitor-only content folds away once a session resolves instead of
// unmounting, so the static shell keeps its DOM and its running animations.
// On a full load the inline script folds it before first paint when this
// browser was signed in last time, so a returning pilot never sees it flash;
// data-settled hands control back to the real session once it resolves.
export function SignedInFold({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const id = useId();
  const folded = session !== null;
  return (
    <>
      <div
        id={id}
        className="signed-in-fold"
        data-folded={folded || undefined}
        data-settled={loading ? undefined : ''}
        aria-hidden={folded || undefined}
        inert={folded}
        suppressHydrationWarning
      >
        <div className="min-h-0">{children}</div>
      </div>
      {/* Runs while the server HTML parses. A client render (a soft
          navigation) never executes it, and React warns about script tags it
          creates, so the client copy is text/plain, per Next's "Preventing
          flash before hydration" guide. */}
      <script
        type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
        suppressHydrationWarning
      >
        {`try{if(localStorage.getItem(${JSON.stringify(SIGNED_IN_HINT_KEY)}))document.getElementById(${JSON.stringify(id)}).setAttribute("data-signed-in-hint","")}catch(e){}`}
      </script>
    </>
  );
}
