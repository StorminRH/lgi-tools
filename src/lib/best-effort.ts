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
