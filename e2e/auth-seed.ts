import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { becomeSyntheticPilot } from '@/composition/synthetic-pilot-store';
import { readEnv } from '@/lib/env';
import { DEFAULT_STORAGE_STATE_PATH as DEFAULT_STORAGE_STATE_RELATIVE } from './identity';

export { E2E_CHARACTER_ID, E2E_CHARACTER_NAME, E2E_USER_ID } from './identity';

config({ path: process.env.DOTENV_PATH ?? '.env.local' });

export const DEFAULT_STORAGE_STATE_PATH = path.resolve(
  process.cwd(),
  DEFAULT_STORAGE_STATE_RELATIVE,
);

export type PlaywrightStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: [];
};

export async function seedE2eStorageState(
  outPath: string = DEFAULT_STORAGE_STATE_PATH,
): Promise<string> {
  const secret = readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to seed E2E auth cookies',
    );
  }

  const { cookies } = await becomeSyntheticPilot();
  const storageState: PlaywrightStorageState = {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: Math.floor(Date.now() / 1000) + cookie.maxAgeSec,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
    origins: [],
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(storageState, null, 2)}\n`);
  return outPath;
}
