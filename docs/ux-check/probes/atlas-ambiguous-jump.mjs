import {
  automaticJumpMapId,
  automaticJumpRoute,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  doorbellAfter,
  sessionUserId,
} from '../lib/doorbell-helpers.mjs';

const CHARACTER_ID = 9_000_001;
const ORIGIN_SYSTEM_ID = 31_001_677;
const DESTINATION_SYSTEM_ID = 31_000_881;
const SHIP_TYPE_ID = 28_606;
const CANDIDATES = [
  { signatureId: 'AAA-111', typeCode: 'C247' },
  { signatureId: 'BBB-222', typeCode: 'K162' },
  { signatureId: 'CCC-333', typeCode: 'K162' },
];

function destinationNode(page) {
  return page.locator(`.react-flow__node[data-id="${DESTINATION_SYSTEM_ID}"]`);
}

function jumpPrompt(page) {
  return page.locator('[data-signature-jump-prompt]');
}

function candidateButton(page, signatureId) {
  return jumpPrompt(page).getByRole('button', { name: new RegExp(`^${signatureId}\\b`) });
}

async function jumpEvidence(mapId, userId) {
  return JSON.parse(await convexRun('mapJumpEvidence:jumpEvidence', {
    mapId,
    userId,
    characterId: CHARACTER_ID,
  }));
}

export default {
  name: 'atlas-ambiguous-jump',
  route: automaticJumpRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, createContext, baseUrl }) {
    const mapId = automaticJumpMapId();
    if (!mapId) {
      check('UX_JUMP_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    const userId = await sessionUserId(page, baseUrl);
    if (userId === null) {
      check('authenticated storage state exposes a session user id', false);
      return;
    }
    await waitForEditableMap(page);
    const second = await createContext();
    await second.page.goto(new URL(`/atlas?map=${mapId}`, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForEditableMap(second.page);
    const clients = [page, second.page];
    const empty = await Promise.all(clients.map((client) =>
      client.locator('[data-map-home-prompt]').count(),
    ));
    check('dedicated ambiguous-jump map starts empty on both clients', empty.every((count) => count === 1));
    if (empty.some((count) => count !== 1)) return;

    const baseTime = Date.now();
    await convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
      mapId,
      userId,
      characterId: CHARACTER_ID,
      solarSystemId: ORIGIN_SYSTEM_ID,
      shipTypeId: SHIP_TYPE_ID,
      transitionObservedAt: baseTime,
    });
    await convexRun('mapStatics:fetchSystemStatics', { mapId, systemId: ORIGIN_SYSTEM_ID });
    await Promise.all(clients.map((client) =>
      client.locator(`.react-flow__node[data-id="${ORIGIN_SYSTEM_ID}"]`)
        .waitFor({ state: 'attached', timeout: 30_000 }),
    ));
    for (const candidate of CANDIDATES) {
      await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
        mapId,
        fromSystemId: ORIGIN_SYSTEM_ID,
        fromSignatureId: candidate.signatureId,
        wormholeTypeCode: candidate.typeCode,
        shipSize: 'L',
      });
    }
    const beforeJump = await jumpEvidence(mapId, userId);
    check('all three possible signatures are unresolved before the jump', beforeJump.candidates.length === 3);
    const beforeNodes = await Promise.all(clients.map((client) => destinationNode(client).count()));
    check('the C3 destination has no node before the jump on either client', beforeNodes.every((count) => count === 0));

    const result = await doorbellAfter(page, () =>
      convexRun('mapFixtureTracking:advanceTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        fromSolarSystemId: ORIGIN_SYSTEM_ID,
        toSolarSystemId: DESTINATION_SYSTEM_ID,
        prevFresh: true,
        transitionObservedAt: baseTime + 1,
      }),
    );
    check(
      'the real doorbell processes the ambiguous jump',
      result?.status === 'processed' && ['authored', 'converged'].includes(result?.outcome),
    );
    await Promise.all(clients.map((client) =>
      jumpPrompt(client).waitFor({ state: 'visible', timeout: 30_000 }),
    ));
    for (const [index, client] of clients.entries()) {
      const prompt = jumpPrompt(client);
      const labels = await prompt.locator('[data-signature-jump-candidate]').allTextContents();
      check(
        `client ${index + 1} offers the named hole and both incoming K162 signatures`,
        labels.length === 3 && CANDIDATES.every((candidate) =>
          labels.some((label) => label.includes(candidate.signatureId) && label.includes(candidate.typeCode)),
        ),
      );
      check(`client ${index + 1} has no destination node while the prompt is open`, (await destinationNode(client).count()) === 0);
    }
    const awaitingAnswer = await jumpEvidence(mapId, userId);
    check(
      'opening the prompt leaves every candidate unresolved without preselecting a row',
      awaitingAnswer.candidates.length === beforeJump.candidates.length
      && beforeJump.candidates.every((candidate) =>
        awaitingAnswer.candidates.some((pending) => pending.id === candidate.id),
      ),
    );

    const alternate = candidateButton(page, 'BBB-222');
    const chosenId = await alternate.getAttribute('data-signature-jump-candidate');
    const namedId = await candidateButton(page, 'AAA-111').getAttribute('data-signature-jump-candidate');
    if (chosenId === null || namedId === null) throw new Error('prompt candidate is missing its connection id');
    await alternate.click();
    await Promise.all(clients.flatMap((client) => [
      jumpPrompt(client).waitFor({ state: 'detached', timeout: 30_000 }),
      destinationNode(client).waitFor({ state: 'attached', timeout: 30_000 }),
    ]));
    check(
      'choosing the alternate K162 settles the prompt and places the destination on both clients',
      (await Promise.all(clients.map(async (client) =>
        (await jumpPrompt(client).count()) === 0 && (await destinationNode(client).count()) === 1,
      ))).every(Boolean),
    );

    const selected = JSON.parse(await convexRun('mapJumpEvidence:connectionEvidence', {
      mapId,
      userId,
      connectionId: chosenId,
    }));
    check(
      'the selected K162 owns the committed destination in the database',
      selected.canEdit === true
      && selected.connection?.connectionId === chosenId
      && selected.connection?.fromSystemId === ORIGIN_SYSTEM_ID
      && selected.connection?.toSystemId === DESTINATION_SYSTEM_ID
      && selected.connection?.destinationProvenance === 'human',
    );
    const remaining = await jumpEvidence(mapId, userId);
    check(
      'the original named hole remains unresolved after choosing the alternate',
      remaining.candidates.some((candidate) => candidate.id === namedId)
      && !remaining.candidates.some((candidate) => candidate.id === chosenId),
    );
  },
};
