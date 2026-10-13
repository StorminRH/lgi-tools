// Next inlines a literal `process.env.NEXT_PUBLIC_*` member access at build
// time, so keep these reads literal: no destructuring and no dynamic key.
// An empty value counts as unset; `.env.example` and the cloud setup ship one.
export function publicConvexUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_CONVEX_URL || undefined;
}

export function isConvexConfigured(): boolean {
  return publicConvexUrl() !== undefined;
}
