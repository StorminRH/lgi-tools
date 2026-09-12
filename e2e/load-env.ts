import { config } from 'dotenv';

// Imported before auth so its factory sees dotenv-only local credentials.
config({ path: process.env.DOTENV_PATH ?? '.env.local' });
