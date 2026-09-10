import { makeSignature } from 'better-auth/crypto';

export async function signSessionToken(token: string, secret: string): Promise<string> {
  return `${token}.${await makeSignature(token, secret)}`;
}
