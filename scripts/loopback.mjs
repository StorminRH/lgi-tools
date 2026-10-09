// URL.hostname form: an IPv6 literal keeps its brackets, so ::1 reads '[::1]'.
// Mirrors the default set in src/lib/url-safety.ts, which plain-node scripts
// cannot import once that module gains an @/ alias.
const LOOPBACK_HOSTNAMES = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.includes(hostname);
}
