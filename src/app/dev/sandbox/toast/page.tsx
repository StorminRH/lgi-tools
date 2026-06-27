import { SandboxHeader } from '../_shared/sandbox-ui';
import { SonnerToastDemo } from './SonnerToastDemo';

// OOB.3.1 — sonner proving harness. Unlinked dev page (the sandbox layout
// noindexes it). Deliberately NOT wrapped in PageShell: a bare shell keeps the
// CSP surface isolated to sonner's own output and avoids the global header's DB
// reads, so `next dev` boots this page with no Docker/Convex. Static shell; the
// toasts are a client island (sonner portals to <body>). The <Toaster> lives on
// this page only — OOB.3.2 moves it to the root layout. See the diagnosis doc.

export default function ToastSandboxPage() {
  return (
    <div className="flex flex-col items-center pt-12 pb-20 px-6">
      <SandboxHeader
        title="Sonner Toasts"
        subtitle="OOB.3.1 · proving loading · promise · success/error render CSP-clean"
      />
      <SonnerToastDemo />
      <p className="mt-10 max-w-[680px] text-center text-[11px] leading-[1.6] text-muted">
        Fire each toast. Zero CSP console violations confirms sonner’s runtime style
        injection is permitted by the post-OOB.1.1 <code>style-src</code>; our JSX
        carries no <code>style</code> attribute, so the real toast (OOB.3.2) needs no
        lint exemption.
      </p>
    </div>
  );
}
