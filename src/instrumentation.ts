import { readEnv } from '@/lib/env';

export async function register(): Promise<void> {
  if (readEnv('NEXT_RUNTIME') !== 'nodejs') return;
  const { registerNeonColdStartTelemetry } = await import('./instrumentation.node');
  registerNeonColdStartTelemetry();
}
