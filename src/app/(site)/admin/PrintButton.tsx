'use client';

import { Button } from '@/components/ui/button';

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
