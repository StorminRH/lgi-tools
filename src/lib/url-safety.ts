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

/** Whether a service secret may be sent to this URL: HTTPS anywhere, or plain HTTP on loopback only. */
export function isSafeServiceUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' || isLocalUrl(value, ['http:']);
  } catch {
    return false;
  }
}
