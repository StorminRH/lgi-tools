'use client';

// Triggers the browser's native print dialog. The @media print stylesheet
// (globals.css) collapses the page to a clean letter/A4 layout — users
// pick "Save as PDF" as the destination to get a shareable file. The
// no-print class hides this button from the output itself.

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-isk transition-colors"
    >
      Print report
    </button>
  );
}
