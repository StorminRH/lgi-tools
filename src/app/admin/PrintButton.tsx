'use client';

import { Button } from '@/components/ui/button';

// Triggers the browser's native print dialog. The @media print stylesheet
// (globals.css) collapses the page to a clean letter/A4 layout — users
// pick "Save as PDF" as the destination to get a shareable file. The
// no-print class hides this button from the output itself.

/**
 * Client control that invokes the browser print dialog and hides itself from the printed document.
 */
export function PrintButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => window.print()}
      className="no-print text-isk"
    >
      Print report
    </Button>
  );
}
