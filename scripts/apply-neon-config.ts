// Operator apply for `neon.ts`: Config-as-Code cannot clear an existing
// branch `expiresAt`, so standing previews get a follow-up PATCH to null.
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { clearStandingPreviewExpirations } from '../neon';

config({ path: process.env.DOTENV_PATH ?? '.env.local' });

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

type NeonBranch = {
  id: string;
  name: string;
  expires_at?: string | null;
};

async function runNeonConfigApply(argv: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('neon', ['config', 'apply', ...argv], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`neon config apply exited ${code ?? 'null'}`));
    });
  });
}

function neonApiAuth(): { projectId: string; apiKey: string } {
  const projectId = process.env.NEON_PROJECT_ID;
  const apiKey = process.env.NEON_API_KEY;
  if (!projectId) throw new Error('NEON_PROJECT_ID is not set');
  if (!apiKey) throw new Error('NEON_API_KEY is not set');
  return { projectId, apiKey };
}

async function neonApi<T>(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${NEON_API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neon ${method} ${path} failed (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

async function listProjectBranches(projectId: string, apiKey: string): Promise<NeonBranch[]> {
  const payload = await neonApi<{ branches: NeonBranch[] }>(
    'GET',
    `/projects/${projectId}/branches`,
    apiKey,
  );
  return payload.branches;
}

async function clearBranchExpiration(
  projectId: string,
  apiKey: string,
  branchId: string,
): Promise<void> {
  await neonApi('PATCH', `/projects/${projectId}/branches/${branchId}`, apiKey, {
    branch: { expires_at: null },
  });
}

async function main(): Promise<void> {
  await runNeonConfigApply(process.argv.slice(2));
  const { projectId, apiKey } = neonApiAuth();
  const branches = await listProjectBranches(projectId, apiKey);
  const cleared = await clearStandingPreviewExpirations(
    branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      expiresAt: branch.expires_at,
    })),
    (branchId) => clearBranchExpiration(projectId, apiKey, branchId),
  );
  if (cleared.length === 0) {
    console.log('Standing preview expiration already clear.');
    return;
  }
  console.log(`Cleared expiration on ${cleared.join(', ')}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
