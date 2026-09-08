import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function sourceIdentity(root = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z', 'src/data/eve-data', 'src/composition/pipelines', 'src/db', 'src/scripts/*sde*', 'drizzle'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  if (!files.length) throw new Error('SDE source files are missing');
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0');
  return hash.digest('hex');
}

export function baselineMatches(source, version, storedIdentity, complete, remoteVersion) {
  return Boolean(version) && version === remoteVersion && complete && storedIdentity === `${source}:${version}`;
}
