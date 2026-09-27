import type { ReactNode } from 'react';
import { requireAdminPage } from '@/composition/route-guards';

// Each admin page gates its own request-time hole: layouts do not rerender
// on sibling navigation, so a layout gate would not run.
export async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
