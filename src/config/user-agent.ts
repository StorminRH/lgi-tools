import { APP_VERSION } from './app-version';

const OUTBOUND_CONTACT = 'https://lgi.tools/contact';

/**
 * Sent on every outbound third-party call (ESI, Fuzzwork). Conventional ESI
 * User-Agent shape `App/<version> (<contact>)`. Composed once here; injected
 * as a default header at each fetch site so a new call can't go anonymous.
 */
export const OUTBOUND_USER_AGENT = `LGI.tools/${APP_VERSION} (${OUTBOUND_CONTACT})`;
