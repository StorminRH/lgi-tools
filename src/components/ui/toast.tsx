'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"

      expand
      visibleToasts={4}
      gap={8}
      theme="dark"

      offset={{ top: 64 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        unstyled: true,
        classNames: {

          toast:
            'flex w-full items-center gap-2.5 rounded-ctl border bg-bg-deep ' +
            'px-3.5 py-2.5 font-ui text-ui tracking-copy shadow-toast',
          icon: 'relative flex h-4 w-4 shrink-0 items-center justify-center',
          content: 'flex flex-col gap-0.5',
          title: 'leading-snug',
          description: 'text-muted leading-snug',

          actionButton:
            'ml-auto shrink-0 rounded-ctl border border-isk-dim bg-feedback-bg ' +
            'px-2 py-1 font-ui text-nav text-isk hover:bg-isk hover:text-isk-ink',

          default: 'text-isk border-isk-dim',
          loading: 'text-isk border-isk-dim',
          success: 'text-isk border-isk-dim',
          error: 'text-tone-red border-tone-red',
        },
      }}
    />
  );
}
