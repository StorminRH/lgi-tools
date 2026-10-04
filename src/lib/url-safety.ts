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

export function assertLocalDatabaseUrl(url: string | undefined, who: string): void {
  if (!isLocalUrl(url, ['postgres:', 'postgresql:'])) {
    throw new Error(`${who} requires a local Postgres DATABASE_URL`);
  }
}
