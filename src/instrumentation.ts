import { readEnv } from '@/lib/env';

/**
 * Loads runtime-specific instrumentation only in the Node.js server runtime, leaving Edge and
 * build-time execution untouched.
 */
export async function register(): Promise<void> {
  if (readEnv('NEXT_RUNTIME') !== 'nodejs') return;
  const { registerNeonColdStartTelemetry } = await import('./instrumentation.node');
  registerNeonColdStartTelemetry();
}
