import { unstable_rethrow } from 'next/navigation';

/**
 * Runs a server read that may degrade: Next's redirect, notFound and dynamic
 * bail-out signals still escape, and any other failure is logged with
 * `message` and replaced by `fallback`.
 */
export async function readOr<T, F>(message: string, load: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await load();
  } catch (err) {
    unstable_rethrow(err);
    console.error(message, err);
    return fallback;
  }
}
