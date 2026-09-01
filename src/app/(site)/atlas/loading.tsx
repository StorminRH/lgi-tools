import { AtlasLandingFallback } from './AtlasLandingFallback';

/** Instant site-shaped shell for /atlas while the session listing resolves. */
export default function AtlasLoading() {
  return <AtlasLandingFallback />;
}
