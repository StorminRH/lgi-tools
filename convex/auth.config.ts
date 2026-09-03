import type { AuthConfig } from 'convex/server';

const issuer = process.env.AUTH_ISSUER_URL;
const jwks = process.env.AUTH_JWKS;

export default {
  providers:
    issuer && jwks
      ? [
          {
            type: 'customJwt',
            issuer,
            algorithm: 'ES256',
            jwks,
            applicationID: 'convex',
          },
        ]
      : [],
} satisfies AuthConfig;
