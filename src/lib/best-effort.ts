/**
 * Runs a side effect whose failure must not stop the caller. A rejection, or a
 * synchronous throw from `action`, is logged as `[scope] label failed`, with
 * ` for subject` appended when a subject is given, and the call resolves.
 */
export async function bestEffort(
  scope: string,
  label: string,
  subject: string | null,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const target = subject === null ? '' : ` for ${subject}`;
    console.error(`[${scope}] ${label} failed${target}`, error);
  }
}
