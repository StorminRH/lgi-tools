import { createContext, createElement, useContext, type ReactNode } from 'react';

/**
 * A static stand-in for Base UI's `Dialog` parts. Base UI portals mount only in
 * a browser, so a markup test swaps these parts in for the Base layer and lets
 * the real ui/dialog parts (Dialog, DialogHeader, SidePanel, ConfirmDialog)
 * render around them. Destructure the import so Fallow sees the use:
 *
 * ```ts
 * vi.mock('@base-ui/react/dialog', async () => {
 *   const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
 *   return { Dialog: StaticBaseDialog };
 * });
 * ```
 *
 * Root, Portal and Popup of the outermost dialog keep their latest props on
 * `dialogProbe`; a dialog rendered inside it (a ConfirmDialog in a dialog body)
 * still renders but leaves the probe alone. Every part forwards only the
 * attributes it names, never a spread, so focus targets and refs stay off the
 * markup. Close ignores Base's `render` element.
 */
export const dialogProbe: {
  root: { open: boolean; modal?: boolean | 'trap-focus'; onOpenChange?: (open: boolean) => void } | null;
  portal: { keepMounted?: boolean } | null;
  popup: { initialFocus?: unknown; finalFocus?: unknown; 'aria-labelledby'?: string } | null;
} = { root: null, portal: null, popup: null };

/** How many dialog roots enclose a part: 1 inside the outermost dialog. */
const DialogDepth = createContext(0);

export const StaticBaseDialog = {
  Root(props: {
    open: boolean;
    modal?: boolean | 'trap-focus';
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
  }) {
    const depth = useContext(DialogDepth);
    if (depth === 0) dialogProbe.root = props;
    return createElement(DialogDepth.Provider, { value: depth + 1 }, props.children);
  },
  Portal(props: { keepMounted?: boolean; children?: ReactNode }) {
    const outermost = useContext(DialogDepth) === 1;
    if (outermost) dialogProbe.portal = props;
    return props.children;
  },
  Backdrop() {
    return null;
  },
  Popup(props: {
    initialFocus?: unknown;
    finalFocus?: unknown;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    className?: string;
    children?: ReactNode;
  }) {
    const outermost = useContext(DialogDepth) === 1;
    if (outermost) dialogProbe.popup = props;
    return createElement(
      'div',
      {
        role: 'dialog',
        'aria-labelledby': props['aria-labelledby'],
        'aria-describedby': props['aria-describedby'],
        className: props.className,
      },
      props.children,
    );
  },
  Close(props: { 'aria-label'?: string; disabled?: boolean; children?: ReactNode }) {
    return createElement(
      'button',
      { type: 'button', 'aria-label': props['aria-label'], disabled: props.disabled },
      props.children,
    );
  },
  Title(props: { id?: string; className?: string; children?: ReactNode }) {
    return createElement('h2', { id: props.id, className: props.className }, props.children);
  },
  Description(props: { id?: string; className?: string; children?: ReactNode }) {
    return createElement('p', { id: props.id, className: props.className }, props.children);
  },
};
