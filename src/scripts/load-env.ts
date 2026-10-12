// Side effect only: every CLI entry imports this first, so its env file is
// loaded before any other module of the entry runs.
import { config } from 'dotenv';
import { readEnv } from '@/lib/env';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });
