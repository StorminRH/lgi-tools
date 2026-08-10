/**
 * Shared helpers for probes that drive the real tracked-transition → doorbell →
 * server-resolver path (atlas-automatic-jump, atlas-signature-lifecycle).
 */

function isDoorbellResponse(response) {
  if (
    new URL(response.url()).pathname !== '/api/maps/jump'
    || response.request().method() !== 'POST'
  ) {
    return false;
  }
  try {
    return response.request().postDataJSON()?.kind === 'doorbell';
  } catch {
    return false;
  }
}

async function waitForDoorbell(page) {
  return await page.waitForResponse(isDoorbellResponse, { timeout: 30_000 });
}

async function responseBody(response) {
  return await response.json().catch(() => null);
}

/** Runs the trigger and returns the JSON body of the doorbell POST it provokes. */
export async function doorbellAfter(page, trigger) {
  const pending = waitForDoorbell(page);
  try {
    await trigger();
  } catch (error) {
    void pending.catch(() => undefined);
    throw error;
  }
  return await responseBody(await pending);
}

/** The signed-in probe account's Better Auth user id, from the live session. */
export async function sessionUserId(page, baseUrl) {
  const response = await page.request.get(
    new URL('/api/auth/get-session', baseUrl).href,
    { failOnStatusCode: true, timeout: 30_000 },
  );
  const session = await response.json();
  return typeof session?.user?.id === 'string' ? session.user.id : null;
}

/** Waits until the canvas holds exactly the expected chain-node and edge counts. */
export async function waitForTopology(page, nodes, edges) {
  await page.waitForFunction(
    ({ expectedNodes, expectedEdges }) =>
      document.querySelectorAll('[data-chain-node]').length === expectedNodes
      && document.querySelectorAll('.react-flow__edge').length === expectedEdges,
    { expectedNodes: nodes, expectedEdges: edges },
    { timeout: 30_000 },
  );
}
