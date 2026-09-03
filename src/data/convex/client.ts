import { ConvexReactClient } from 'convex/react';

const url = process.env.NEXT_PUBLIC_CONVEX_URL;

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
