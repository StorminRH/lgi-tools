// Convex component registry. The Action Retrier wraps the skill-sync action
// (3.4.7) in durable exponential-backoff retries with an exactly-once
// onComplete callback.
import actionRetrier from '@convex-dev/action-retrier/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(actionRetrier);
export default app;
