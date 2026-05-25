# LGI.tools — Version 2.8 Plan

## What this is

Version 2.8 prepares LGI.tools for its Public Beta launch on the EVE forums and Reddit. It introduces the platform's authentication (EVE SSO), an admin management tier, a terminal-style search, and the telemetry engine required for the EVE Partner Program.

Crucially, it also implements the necessary legal disclosures and feedback loops required for a public beta release.

## How to use this document

Same shape as prior plan docs. Before this session, read `CLAUDE.md`, `AGENTS.md`, and `SCRATCHPAD.md`. Then read the sub-version below that you're about to start, and form your own plan. Confirm with the user before committing to one.

## Decisions already made

- **Sleeper Loot is backlogged.** The plan to extract exact drop quantities for live combat ISK (formerly 2.7.4) is officially deferred to the backlog to prioritize the beta launch.
- **EVE SSO is the only Auth.** No email/password registrations.
- **Database-Driven Roles & States.** Logged-in users get a record in `characters` with a default `USER` role and a JSONB field for preferences.
- **The Bootstrap Admin.** The superadmin account is bootstrapped via a single `SUPERADMIN_CHARACTER_ID` in `.env.local`. They can then use the UI to grant `ADMIN` roles to others.
- **First-Party Analytics.** Analytics are tracked internally in a `usage_logs` table to comply with the Partner Program without third-party trackers.
- **Feedback via Discord.** Bug reports and feedback are routed directly to the developer's Discord via a Webhook, keeping the database lean.
- **Beta Branding.** The header stays clean. Beta expectations are set via a prominent banner on the changelog page, which is linked from the version number in the global footer.
- **Changelog is curated and grouped.** Uses a static file (like `.html` or `.md`). Additions that occur on the same date are grouped under a single date heading, with bullet-style additions below. *Note: Evaluate what is worth including. Only log user-facing or significant platform changes; minor tweaks, refactors, and rapid session PRs do not need to be reported.*

---

## 2.8.1 — ESI Auth, EVE SSO, & Character Table

**Goal.** Plumb EVE SSO so a user can click "Log in with EVE", authenticate via CCP's servers, and return to the app with a secure session holding their Character ID, Name, and ESI token. Record this character in the database.

**Details:**
- Create an EVE SSO application in the EVE Developer portal.
- Implement the OAuth2 flow. Recommendation: Use NextAuth.js (Auth.js) with a custom EVE Online provider, or write a lightweight custom route handler.
- **DB Schema:** Create a `characters` table with fields for `characterId` (primary key), `name`, `portraitUrl`, `role` (default `'USER'`), and `preferences` (JSONB). Upsert the character on successful login.
- Expose the logged-in user's Character ID clearly on the screen so the user can copy it for the Step 2 bootstrap.

---

## 2.8.2 — Admin Gate & Privilege Management UI

**Goal.** Create a `/admin` route protected by ESI authentication. The dashboard should allow the superadmin to search for other users who have logged in and grant them admin privileges.

**Details:**
- Add `SUPERADMIN_CHARACTER_ID` to `.env.local`.
- Create middleware or a Server Component check to protect `/admin/*`. Access is granted if the logged-in character's ID matches the `SUPERADMIN_CHARACTER_ID` or if their database role is `ADMIN`.
- Build the `/admin` dashboard. Include a search bar that queries the `characters` table by name.
- Display a list of returned characters with a toggle/button to grant or revoke the `ADMIN` role.

---

## 2.8.3 — Terminal Search, Changelog, and Global Footers

**Goal.** Add the terminal-style search to the Wormhole Sites browser, and implement the global footer + changelog foundation.

**Details:**
- **Terminal Search:** Add a text input to `/sites`. It must parse strings like `c3/relic`, `c5`, or `ore` and translate them into router pushes (e.g., `?class=c3&type=relic`).
- **Global Footer:** Create a shared `<Footer>` component with CCP legal text, a feedback affordance, and the current application version number (e.g., `v2.8.0`) which serves as a link to the Changelog.
- **Changelog:** Create a `/changelog` route powered by a local `.html` or `.md` file. Format: A single Date heading per day, followed by bulleted items for each user-facing change. Filter out minor internal tweaks when drafting updates.

---

## 2.8.4 — Analytics Telemetry & User State

**Goal.** Implement an internal telemetry engine to log usage statistics for the EVE Partner Program, and wire up the preferences database column to remember user states.

**Details:**
- **DB Schema:** Create a `usage_logs` table. Fields: `id`, `timestamp`, `characterId`, `action`, `metadata` (JSONB).
- **Telemetry Tracker:** Build a lightweight tracker (API endpoint + middleware/hook) to log page views and searches silently.
- **User States:** Save a logged-in user's active filter states to `characters.preferences` so they persist across sessions.
- **Admin Dashboard Addition:** Add a basic aggregate view to the `/admin` page showing total usage metrics.

---

## 2.8.5 — Public Beta Readiness (Feedback, Legal, Errors)

**Goal.** Prepare the application for public traffic by adding a frictionless feedback loop, satisfying CCP's legal requirements, and handling crashes gracefully.

**Details:**
- **Discord Feedback Loop:** Build a simple modal or `/feedback` route. It must accept a text message and (optionally) the user's logged-in Character Name. Instead of saving to the DB, it should `POST` to a Discord Webhook URL provided in `.env.local`.
- **Legal/Privacy Page:** Create a static `/legal` route disclosing our telemetry collection and CCP's developer boilerplate.
- **Beta Branding:** Ensure the `/changelog` page has a prominent "BETA" header/notice positioned above the list of updates to set expectations for early users.
- **Error Boundaries:** Add custom `not-found.tsx` (404) and `error.tsx` (500) pages to Next.js so crashes fail gracefully.
