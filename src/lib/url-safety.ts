export function isLocalUrl(
  value: string | undefined,
  protocols: readonly string[],
  hosts: readonly string[] = ['localhost', '127.0.0.1', '[::1]'],
): boolean {
  try {
    const url = new URL(value ?? '');
    return protocols.includes(url.protocol) && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}
