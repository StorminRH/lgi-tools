/**
 * Runs an optional async side-effect without letting its failure abort the
 * caller. Logs a breadcrumb when the action is unregistered so unwired entry
 * points are diagnosable.
 */
export async function bestEffort(
  scope: string,
  label: string,
  subject: string,
  action: (() => Promise<unknown>) | undefined,
): Promise<void> {
  if (action === undefined) {
    console.error(`[${scope}] ${label} skipped for ${subject}: action unregistered`);
    return;
  }
  try {
    await action();
  } catch (error) {
    console.error(`[${scope}] ${label} failed for ${subject}`, error);
  }
}
