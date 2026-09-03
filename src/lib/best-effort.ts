export async function bestEffort(
  scope: string,
  label: string,
  subject: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[${scope}] ${label} failed for ${subject}`, error);
  }
}
