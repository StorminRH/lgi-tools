export interface PointerAnchor {
  getBoundingClientRect(): DOMRect;
}

export function pointerAnchor(clientX: number, clientY: number): PointerAnchor {
  return {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ width: 0, height: 0, x: clientX, y: clientY }),
  };
}
