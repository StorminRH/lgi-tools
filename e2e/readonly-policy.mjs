export function permitsReadOnlyHttp(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function permitsReadOnlySocket(message) {
  if (typeof message !== 'string') return false;
  try {
    const value = JSON.parse(message);
    return value !== null && typeof value === 'object' &&
      ['Connect', 'Authenticate', 'ModifyQuerySet'].includes(value.type);
  } catch { return false; }
}
