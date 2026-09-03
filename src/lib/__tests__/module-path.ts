export function normalizeModulePath(path: string): string {
  const resolved: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join('/');
}
