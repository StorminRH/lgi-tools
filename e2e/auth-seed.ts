import './load-env';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { becomeSyntheticPilot } from '@/composition/synthetic-pilot-store';
import type { SyntheticPilot } from '@/platform/auth/synthetic-pilot';
import {
  DEFAULT_STORAGE_STATE_PATH as DEFAULT_STORAGE_STATE_RELATIVE,
  PLAIN_STORAGE_STATE_PATH as PLAIN_STORAGE_STATE_RELATIVE,
} from './identity';

export { E2E_CHARACTER_ID, E2E_CHARACTER_NAME, E2E_USER_ID } from './identity';

export const DEFAULT_STORAGE_STATE_PATH = path.resolve(
  process.cwd(),
  DEFAULT_STORAGE_STATE_RELATIVE,
);

export const PLAIN_STORAGE_STATE_PATH = path.resolve(process.cwd(), PLAIN_STORAGE_STATE_RELATIVE);

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
  pilot?: SyntheticPilot,
): Promise<string> {
  const { cookies } = await becomeSyntheticPilot(undefined, pilot);
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
