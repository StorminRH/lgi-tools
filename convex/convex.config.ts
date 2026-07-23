// Convex component registry. The Workpool runs the engine's sync actions with
// bounded concurrency and durable exponential-backoff retries (it subsumes the
// 3.4.7 Action Retrier — same retry semantics plus a parallelism cap); the
// Rate Limiter smooths per-token-group dispatch so a re-arm herd can't burst
// ESI (the Redis scoreboard in src/platform/esi stays the one budget authority).
import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import workpool from '@convex-dev/workpool/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(workpool);
app.use(rateLimiter);
export default app;
