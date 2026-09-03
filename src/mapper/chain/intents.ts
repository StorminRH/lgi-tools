export interface ChainPosition {
  readonly x: number;
  readonly y: number;
}

export type MapChainIntent =
  | {
      readonly kind: 'system-appeared';
      readonly systemId: number;
      readonly position: ChainPosition;
    }
  | {
      readonly kind: 'system-departed';
      readonly systemId: number;
    }
  | {
      readonly kind: 'system-moved';
      readonly systemId: number;
      readonly from: ChainPosition;
      readonly to: ChainPosition;
    }
  | {
      readonly kind: 'connection-appeared';
      readonly connectionId: string;
      readonly fromSystemId: number;
      readonly toSystemId: number;
    }
  | {
      readonly kind: 'connection-departed';
      readonly connectionId: string;
    };

export function samePosition(a: ChainPosition, b: ChainPosition): boolean {
  return a.x === b.x && a.y === b.y;
}
