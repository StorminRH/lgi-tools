'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

// The single seam onto sonner — the ONLY module that imports the library, so no
// feature or provider ever talks to raw `sonner`. Re-exports the imperative
// `toast` (the provider drives the sync affordance with it; one-off callers get
// success/error) and a `<Toaster>` pre-styled to the terminal/EVE aesthetic.
//
// Styling note (why `unstyled`): sonner injects its own stylesheet at runtime,
// un-layered — so it OUTRANKS Tailwind's @layer utilities (the same cascade
// gotcha as the lightbox CSS). `unstyled` drops sonner's `[data-styled]` rules
// entirely, so our className map fully owns layout + colour with no specificity
// fight. The toast/exit animations and the loading spinner are NOT gated on
// `data-styled`, so they survive — the spinner only needs its `[data-icon]` box
// to stay `relative` + sized, which the `icon` slot restores. Colour is set per
// type slot (loading/success/error/default), never on the base toast, so two
// Tailwind colour utilities never collide on one element. All className strings,
// no JSX `style` attribute → no lint exemption (the OOB.3.1 answer holds; rgba
// glow is permitted, the ban is hex-only). The one thing className can't reach is
// the loading spinner's colour (sonner paints it from --gray11 in its own
// un-layered rule), so that green tint lives in globals.css.

export { toast };

/**
 * Renders the domain-neutral toaster with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      theme="dark"
      // Clear the 50px flow header so a top-centred toast floats below the nav
      // as a distinct card (viewport-fixed via sonner's portal — decoupled from
      // header flow by construction, which is the whole point of OOB.3).
      offset={{ top: 64 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Terminal card: near-black screen, green-dim hairline, a faint green
          // glow + a dark drop shadow, mono with a little letter-spacing. Colour
          // and border-colour are set per TYPE slot below (never here), so a
          // single colour utility lands on each toast — no Tailwind conflict.
          toast:
            'flex w-full items-center gap-2.5 rounded-ctl border bg-bg-deep ' +
            'px-3.5 py-2.5 font-mono text-ui tracking-ui shadow-toast',
          icon: 'relative flex h-4 w-4 shrink-0 items-center justify-center',
          content: 'flex flex-col gap-0.5',
          title: 'leading-snug',
          description: 'text-muted leading-snug',
          // Per-type colour + border — the icon (currentColor) and title inherit
          // the text colour. Green for the sync/success/info path, red for errors.
          default: 'text-isk border-isk-dim',
          loading: 'text-isk border-isk-dim',
          success: 'text-isk border-isk-dim',
          error: 'text-tone-red border-tone-red',
        },
      }}
    />
  );
}
