import { describe, expect, it } from 'vitest';
import {
  convexDeployArgs,
  isStagingPreviewBuild,
  STAGING_GIT_REF,
  STAGING_PREVIEW_LINE,
} from './vercel-convex-deploy';

const shared = [
  'deploy',
  '--cmd',
  'pnpm build:vercel',
  '--cmd-url-env-var-name',
  'NEXT_PUBLIC_CONVEX_URL',
] as const;

describe('isStagingPreviewBuild', () => {
  it('is true for the staging git ref, custom environment, or preview-line env', () => {
    expect(isStagingPreviewBuild({ VERCEL_GIT_COMMIT_REF: STAGING_GIT_REF })).toBe(true);
    expect(isStagingPreviewBuild({ VERCEL_TARGET_ENV: STAGING_PREVIEW_LINE })).toBe(true);
    expect(isStagingPreviewBuild({ LGI_PREVIEW_LINE: STAGING_PREVIEW_LINE })).toBe(true);
  });

  it('is false for production, development, and an empty env', () => {
    expect(isStagingPreviewBuild({ VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false);
    expect(isStagingPreviewBuild({ VERCEL_GIT_COMMIT_REF: 'development' })).toBe(false);
    expect(isStagingPreviewBuild({})).toBe(false);
  });
});

describe('convexDeployArgs', () => {
  it('keeps the prod-key-on-preview guard off the staging line', () => {
    expect(convexDeployArgs({ VERCEL_GIT_COMMIT_REF: 'main' })).toEqual([...shared]);
    expect(convexDeployArgs({ VERCEL_GIT_COMMIT_REF: 'development' })).toEqual([...shared]);
    expect(convexDeployArgs({})).toEqual([...shared]);
  });

  it('disables the guard for the standing staging Preview', () => {
    const disabled = [...shared, '--check-build-environment', 'disable'];
    expect(convexDeployArgs({ VERCEL_GIT_COMMIT_REF: STAGING_GIT_REF })).toEqual(disabled);
    expect(convexDeployArgs({ VERCEL_TARGET_ENV: STAGING_PREVIEW_LINE })).toEqual(disabled);
    expect(convexDeployArgs({ LGI_PREVIEW_LINE: STAGING_PREVIEW_LINE })).toEqual(disabled);
  });
});
