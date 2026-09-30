import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
// Nothing calls the rate limiter since the location scheduler replaced the
// scan engine; it stays mounted until the schema cleanup follow-up unmounts it.
app.use(rateLimiter);
export default app;
