import { createPublicKey } from 'node:crypto';

export function validateJwks(body) {
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) throw new Error('JWKS has no signing keys');
  for (const key of parsed.keys) {
    if (key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.kid !== 'string' || !key.kid || key.d) throw new Error('JWKS must contain public ES256 signing keys');
    createPublicKey({ key, format: 'jwk' });
  }
  return `data:text/plain;charset=utf-8;base64,${Buffer.from(body).toString('base64')}`;
}

