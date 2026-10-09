import type { ReactNode } from 'react';

export function DetailBody({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border-soft px-3.5 py-3 flex flex-col gap-4">{children}</div>
  );
}

export function DetailCaption({ children }: { children: ReactNode }) {
  return <div className="font-data text-ui text-muted">{children}</div>;
}
