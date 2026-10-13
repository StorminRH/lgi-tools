/**
 * Routes onValueChange for a search field whose list items are picks. Base UI reports every
 * commit (a click, Enter on the highlighted item, a drag released on an item) as one change
 * with reason 'item-press', carrying the item's string value it fills the input with. A press
 * goes to onPick, so that fill never reaches onType; anything else, typing included, goes to
 * onType. Call it inside the handler, so callbacks that touch refs run outside render.
 *
 * With a lookup the pressed value names the pick, and a value the lookup does not know is typing.
 */
export function pickOrType<T>(
  next: string,
  details: { readonly reason: string },
  route: {
    readonly lookup: (value: string) => T | undefined;
    readonly onType: (text: string) => void;
    readonly onPick: (item: T) => void;
  },
): void;
/** Without a lookup the pressed value is the pick. */
export function pickOrType(
  next: string,
  details: { readonly reason: string },
  route: { readonly onType: (text: string) => void; readonly onPick: (value: string) => void },
): void;
export function pickOrType<T>(
  next: string,
  details: { readonly reason: string },
  route: {
    readonly lookup?: (value: string) => T | undefined;
    readonly onType: (text: string) => void;
    readonly onPick: (item: T | string) => void;
  },
): void {
  const picked = details.reason !== 'item-press' ? undefined : route.lookup ? route.lookup(next) : next;
  if (picked === undefined) route.onType(next);
  else route.onPick(picked);
}
