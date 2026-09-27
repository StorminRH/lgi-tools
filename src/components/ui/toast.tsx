'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast };

// Toasts are dense glass like menus and popovers: readable over any page or
// the map, with the type carried by the icon (and a red edge for errors)
// rather than a tinted slab. Each is sized to its text and centred; up to
// three stack, older ones sliding down.
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      expand
      visibleToasts={3}
      gap={8}
      theme="dark"
      offset={{ top: 64 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Sized to its text and centred in the stack. `translate` composes
          // with sonner's own transform animation; below sonner's 600px
          // breakpoint its unlayered CSS pins toasts full width instead.
          toast:
            'left-1/2 flex w-max max-w-[var(--width)] -translate-x-1/2 items-center gap-2.5 rounded-card ' +
            'border border-border glass-dense glass-lit px-3.5 py-2.5 font-ui text-ui tracking-copy ' +
            'text-name shadow-dd max-[600px]:translate-x-0',
          icon: 'relative flex h-4 w-4 shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-col gap-0.5',
          title: 'leading-snug',
          description: 'text-muted leading-snug',
          actionButton:
            'ml-auto shrink-0 cursor-pointer rounded-ctl border border-border bg-row-on px-2 py-1 font-ui text-nav ' +
            'text-isk transition-colors hover:border-isk-dim hover:bg-isk-hover-strong',
          default: '[&_[data-icon]]:text-isk',
          loading: '[&_[data-icon]]:text-isk',
          success: '[&_[data-icon]]:text-isk',
          info: '[&_[data-icon]]:text-name',
          warning: 'border-tone-orange/40 [&_[data-icon]]:text-tone-orange',
          error: 'border-tone-red/40 [&_[data-icon]]:text-tone-red',
        },
      }}
    />
  );
}
