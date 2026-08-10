/** Zero-size virtual element accepted by Base UI floating positioners. */
export interface PointerAnchor {
  getBoundingClientRect(): DOMRect;
}

/** Creates a virtual floating-position anchor at one client pointer coordinate. */
export function pointerAnchor(clientX: number, clientY: number): PointerAnchor {
  return {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ width: 0, height: 0, x: clientX, y: clientY }),
  };
}
