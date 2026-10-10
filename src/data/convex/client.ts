import { ConvexReactClient } from 'convex/react';
import { publicConvexUrl } from '@/config/public-env';

const url = publicConvexUrl();

const consoleLogger = {
  logVerbose(...args: unknown[]) {
    console.debug(...args);
  },
  log(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
};

export const convexClient: ConvexReactClient | null = url
  ? new ConvexReactClient(url, { logger: consoleLogger, initialAuthTokenReuse: true })
  : null;
