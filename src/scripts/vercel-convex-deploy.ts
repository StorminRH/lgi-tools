// Vercel `vercel-build` entry. Staging is a Vercel Preview that deploys to the
// extra prod-type Convex `staging` backend. Convex refuses a prod-type
// CONVEX_DEPLOY_KEY when VERCEL_ENV is not production unless this check is
// disabled. Other Preview git refs keep the guard so a leaked prod key cannot
// ship to production Convex.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEnv } from '@/lib/env';

export const STAGING_GIT_REF = 'staging';
export const STAGING_PREVIEW_LINE = 'staging';

export type ConvexDeployEnv = {
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_TARGET_ENV?: string;
  LGI_PREVIEW_LINE?: string;
};

/**
 * True when this Vercel build is the standing `staging` Preview. Origin
 * deploys may omit `VERCEL_GIT_COMMIT_REF`. The custom environment sets
 * `VERCEL_TARGET_ENV`; `LGI_PREVIEW_LINE` is the explicit fallback.
 */
export function isStagingPreviewBuild(env: ConvexDeployEnv): boolean {
  return (
    env.VERCEL_GIT_COMMIT_REF === STAGING_GIT_REF ||
    env.VERCEL_TARGET_ENV === STAGING_PREVIEW_LINE ||
    env.LGI_PREVIEW_LINE === STAGING_PREVIEW_LINE
  );
}

export function convexDeployArgs(env: ConvexDeployEnv): string[] {
  const args = [
    'deploy',
    '--cmd',
    'pnpm build:vercel',
    '--cmd-url-env-var-name',
    'NEXT_PUBLIC_CONVEX_URL',
  ];
  if (isStagingPreviewBuild(env)) {
    args.push('--check-build-environment', 'disable');
  }
  return args;
}

function runConvexDeploy(env: ConvexDeployEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'convex', ...convexDeployArgs(env)], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const code = await runConvexDeploy({
    VERCEL_GIT_COMMIT_REF: readEnv('VERCEL_GIT_COMMIT_REF'),
    VERCEL_TARGET_ENV: readEnv('VERCEL_TARGET_ENV'),
    LGI_PREVIEW_LINE: readEnv('LGI_PREVIEW_LINE'),
  });
  if (code !== 0) process.exit(code);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
