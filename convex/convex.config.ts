
// dispatch so a re-arm herd can't burst ESI (the Redis scoreboard in
// src/platform/esi stays the one budget authority).
import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(rateLimiter);
export default app;
