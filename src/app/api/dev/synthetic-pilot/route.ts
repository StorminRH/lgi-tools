import {
  becomeSyntheticPilot,
  type SyntheticPilotSessionCookie,
} from '@/composition/synthetic-pilot-store';
import { canMintSyntheticPilot } from '@/platform/auth/synthetic-pilot';

// authz: public
// input: none
export async function GET(request: Request): Promise<Response> {
  if (
    !canMintSyntheticPilot({
      hostHeader: request.headers.get('host'),
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return new Response(null, { status: 404 });
  }

  const { cookies } = await becomeSyntheticPilot();
  const headers = new Headers({ Location: new URL('/', request.url).href });
  for (const cookie of cookies) {
    headers.append('Set-Cookie', serializeLocalhostSessionCookie(cookie));
  }
  return new Response(null, { status: 303, headers });
}

function serializeLocalhostSessionCookie(cookie: SyntheticPilotSessionCookie): string {
  const parts = [
    `${cookie.name}=${cookie.value}`,
    `Domain=${cookie.domain}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAgeSec}`,
    `SameSite=${cookie.sameSite}`,
  ];
  if (cookie.httpOnly) parts.push('HttpOnly');
  if (cookie.secure) parts.push('Secure');
  return parts.join('; ');
}
