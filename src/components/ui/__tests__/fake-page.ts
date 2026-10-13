/**
 * Stand-ins for the parts of a browser page that popup and Escape handling
 * read, for node tests with no DOM. Stub `document` and `window` with
 * `new EventTarget()` objects (adding `querySelector: fakeQuerySelector(page)`
 * to the document) and dispatch `keyDown(...)` events on them.
 */

/** An element on a fake page: its attributes and the element it sits in. */
export interface FakeElement {
  readonly attributes: Readonly<Record<string, string>>;
  readonly parent?: FakeElement;
}

// `[name]`, `[name="value"]` and `:not(...)` around either: all the popup
// selectors use. Anything else in a selector throws rather than matching.
const ATTRIBUTE_TEST = /(:not\()?\[([\w-]+)(?:="([^"]*)")?\]\)?/g;

function matchesCompound(element: FakeElement, compound: string): boolean {
  if (compound.replace(ATTRIBUTE_TEST, '') !== '') throw new Error(`fakeQuerySelector cannot read "${compound}"`);
  return [...compound.matchAll(ATTRIBUTE_TEST)].every(([, not, name = '', value]) => {
    const present = Object.hasOwn(element.attributes, name) && (value === undefined || element.attributes[name] === value);
    return not === undefined ? present : !present;
  });
}

/** Whether an element matches one selector of compounds joined by descendant spaces. */
function matchesSelector(element: FakeElement, selector: string): boolean {
  const [own = '', ...outer] = selector.trim().split(/\s+/).reverse();
  if (!matchesCompound(element, own)) return false;
  let scope = element.parent;
  for (const compound of outer) {
    while (scope !== undefined && !matchesCompound(scope, compound)) scope = scope.parent;
    if (scope === undefined) return false;
    scope = scope.parent;
  }
  return true;
}

/**
 * `document.querySelector` over a page of elements, read when called, so a
 * test can push and remove elements as popups open and close. List every
 * element on the page; parents are only walked for descendant selectors.
 */
export function fakeQuerySelector(page: readonly FakeElement[]): (selectors: string) => FakeElement | null {
  return (selectors) =>
    page.find((element) => selectors.split(',').some((selector) => matchesSelector(element, selector))) ?? null;
}

/** A cancelable keydown, as a browser dispatches for a key press. */
export function keyDown(key: string): Event {
  return Object.assign(new Event('keydown', { cancelable: true }), { key });
}
