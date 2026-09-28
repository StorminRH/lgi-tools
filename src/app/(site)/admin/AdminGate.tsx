import type { ReactNode } from 'react';
import { requireAdminPage } from '@/composition/route-guards';

// The layout gates the console chrome, and each page gates its own hole too:
// layouts do not rerender on sibling navigation, and every segment reaches
// the RSC payload whether or not the layout renders it.
export async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
