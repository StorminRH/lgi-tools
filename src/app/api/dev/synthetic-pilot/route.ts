import { becomeSyntheticPilot } from '@/composition/synthetic-pilot-store';
import { canMintSyntheticPilotRequest } from '@/platform/auth/synthetic-pilot';

// authz: public
// input: none
export async function POST(request: Request): Promise<Response> {
  if (!canMintSyntheticPilotRequest(request)) {
    return new Response(null, { status: 404 });
  }

  const issued = await becomeSyntheticPilot(request.headers);
  const headers = new Headers(issued.headers);
  headers.set('Location', '/');
  return new Response(null, { status: 303, headers });
}
