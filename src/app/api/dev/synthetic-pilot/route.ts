import { becomeSyntheticPilot } from '@/composition/synthetic-pilot-store';
import { canMintSyntheticPilot } from '@/platform/auth/synthetic-pilot';

// authz: public
// input: none
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (
    !canMintSyntheticPilot({
      hostHeader: request.headers.get('host'),
      nodeEnv: process.env.NODE_ENV,
    })
    || url.hostname !== 'localhost'
    || request.headers.get('host') !== url.host
    || request.headers.get('origin') !== url.origin
  ) {
    return new Response(null, { status: 404 });
  }

  const issued = await becomeSyntheticPilot(request.headers);
  const headers = new Headers(issued.headers);
  headers.set('Location', '/');
  return new Response(null, { status: 303, headers });
}
