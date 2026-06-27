import { SandboxHeader } from '../_shared/sandbox-ui';
import { SonnerToastDemo } from './SonnerToastDemo';

// OOB.3.2 — the shipped sonner toast affordance, exercised through the real seam
// (@/components/ui/toast + the ambient LoadingToastProvider, both wired in the
// root layout). Unlinked dev page (the sandbox layout noindexes it). The tall
// spacer below makes the route scrollable so the CSP/scroll probe can prove the
// toast stays put on scroll — the OOB.3 scroll-detach fix. See the diagnosis doc.

export default function ToastSandboxPage() {
  return (
    <div className="flex flex-col items-center pt-12 pb-20 px-6">
      <SandboxHeader
        title="Sonner Toasts"
        subtitle="OOB.3.2 · shipped sync affordance + one-off success/error, via @/components/ui/toast"
      />
      <SonnerToastDemo />
      <p className="mt-10 max-w-[680px] text-center text-[11px] leading-[1.6] text-muted">
        Fire a sync, then scroll: the toast stays pinned to the viewport (sonner’s
        portal) instead of detaching from the header — the OOB.3 fix. Zero CSP
        console violations confirms sonner’s runtime style injection is permitted
        by the post-OOB.1.1 <code>style-src</code>, and the wrapper uses no{' '}
        <code>style</code> attribute (no lint exemption).
      </p>
      {/* Scroll spacer — room for the probe (and a human) to scroll while a toast
       * is up, to confirm it doesn't move with the page. */}
      <div
        className="mt-12 flex h-[1200px] w-full max-w-[680px] items-start justify-center border-t border-border-soft pt-4 text-[10px] uppercase tracking-[0.16em] text-faint"
        aria-hidden="true"
      >
        scroll region
      </div>
    </div>
  );
}
