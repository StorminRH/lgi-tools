import { APP_VERSION } from './app-version';

// Maintainer contact for outbound API etiquette. CCP's ESI guidelines and
// Fuzzwork both want a reachable contact so they can warn before throttling
// rather than cut us off. Stable literal (not SITE_URL, which is env-
// overridable on previews). Update if a dedicated contact page lands.
const OUTBOUND_CONTACT = 'https://lgi.tools';

// Sent on every outbound third-party call (ESI, Fuzzwork). Conventional ESI
// User-Agent shape `App/<version> (<contact>)`. Composed once here; injected
// as a default header at each fetch site so a new call can't go anonymous.
export const OUTBOUND_USER_AGENT = `LGI.tools/${APP_VERSION} (${OUTBOUND_CONTACT})`;
