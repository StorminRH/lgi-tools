import { useCallback, type ForwardedRef, type RefCallback } from 'react';

/**
 * Runtime-dynamic CSS (custom properties, flex-grow) written onto a host element through a
 * callback ref, the house alternative to an inline `style` attribute.
 *
 * The ref is keyed on what it writes, so React calls it again during the commit whenever a
 * value changes: the old ref gets null, then the new one gets the node, before paint. A
 * changed value, a remount and a host that mounts later than its component (a conditional
 * branch, a portal) are all written in the frame they first show, with no effect and no state.
 * A property is only ever set, never removed: a later value overwrites it.
 *
 * A forwarded ref receives the node on attach and null on detach, so it also sees null and then
 * the node again whenever a value changes.
 */

function assignRef<E>(ref: ForwardedRef<E> | undefined, node: E | null): void {
  if (typeof ref === 'function') ref(node);
  else if (ref != null) ref.current = node;
}

function attachStyles<E extends HTMLElement | SVGElement>(
  node: E | null,
  properties: Readonly<Record<string, string>> | null | undefined,
  forwardedRef: ForwardedRef<E> | undefined,
): void {
  if (node !== null && properties != null) {
    for (const [name, value] of Object.entries(properties)) node.style.setProperty(name, value);
  }
  assignRef(forwardedRef, node);
}

/**
 * Writes every property of a record (name to value, e.g. `{ '--pct': '40%' }`) on attach; null
 * or undefined writes nothing. The record must keep its identity across renders (a module
 * constant or a useMemo): a fresh literal each render still works, but detaches and re-attaches
 * the ref on every render.
 */
export function useStyleProperties<E extends HTMLElement | SVGElement>(
  properties: Readonly<Record<string, string>> | null | undefined,
  forwardedRef?: ForwardedRef<E>,
): RefCallback<E> {
  return useCallback(
    (node: E | null) => attachStyles(node, properties, forwardedRef),
    [properties, forwardedRef],
  );
}

/** Writes one property on attach, and again in the commit that changes its value. */
export function useStyleProperty<E extends HTMLElement | SVGElement>(
  name: string,
  value: string,
  forwardedRef?: ForwardedRef<E>,
): RefCallback<E> {
  return useCallback(
    (node: E | null) => attachStyles(node, { [name]: value }, forwardedRef),
    [name, value, forwardedRef],
  );
}
