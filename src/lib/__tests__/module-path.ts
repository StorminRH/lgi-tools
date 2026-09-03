/**
 * Resolves `.` and `..` segments in a POSIX-style module path, dropping empty segments, so paths
 * built from a base directory and a relative specifier compare as one canonical string. Pure string
 * work — it never touches the filesystem, so it is safe in test-time reflection and source scanning
 * where the path may not exist on disk.
 */
export function normalizeModulePath(path: string): string {
  const resolved: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join('/');
}
