import type { LayoutEdge, LayoutFacts } from './layout-contract';

export interface ChainTree {

  readonly rootSystemId: number | null;

  readonly parents: ReadonlyMap<number, number>;

  readonly childrenInOrder: ReadonlyMap<number, readonly number[]>;

  readonly attachmentOrder: readonly number[];

  readonly loopEdges: readonly LayoutEdge[];

  readonly orphans: readonly number[];
}

const EMPTY_TREE: ChainTree = {
  rootSystemId: null,
  parents: new Map(),
  childrenInOrder: new Map(),
  attachmentOrder: [],
  loopEdges: [],
  orphans: [],
};

function resolveRoot(facts: LayoutFacts, known: ReadonlySet<number>): number | null {
  if (facts.rootSystemId !== undefined && known.has(facts.rootSystemId)) {
    return facts.rootSystemId;
  }
  return facts.systems[0]?.systemId ?? null;
}

interface Derivation {
  readonly known: ReadonlySet<number>;
  readonly attached: Set<number>;
  readonly parents: Map<number, number>;
  readonly childrenInOrder: Map<number, number[]>;
  readonly attachmentOrder: number[];
  readonly loopEdges: LayoutEdge[];
  readonly classified: Set<number>;
}

function attach(state: Derivation, child: number, parent: number): void {
  state.attached.add(child);
  state.parents.set(child, parent);
  state.attachmentOrder.push(child);
  const siblings = state.childrenInOrder.get(parent);
  if (siblings === undefined) state.childrenInOrder.set(parent, [child]);
  else siblings.push(child);
}

function examineEdge(state: Derivation, index: number, edge: LayoutEdge): boolean {
  const fromAttached = state.attached.has(edge.fromSystemId);
  const toAttached = state.attached.has(edge.toSystemId);
  if (fromAttached && toAttached) {

    state.classified.add(index);
    state.loopEdges.push({ fromSystemId: edge.fromSystemId, toSystemId: edge.toSystemId });
    return false;
  }
  if (fromAttached && state.known.has(edge.toSystemId)) {
    state.classified.add(index);
    attach(state, edge.toSystemId, edge.fromSystemId);
    return true;
  }
  if (toAttached && state.known.has(edge.fromSystemId)) {
    state.classified.add(index);
    attach(state, edge.fromSystemId, edge.toSystemId);
    return true;
  }
  return false;
}

function drainPending(state: Derivation, facts: LayoutFacts, pending: number[]): void {
  let attachedInPass = true;
  while (attachedInPass) {
    attachedInPass = false;
    for (const index of pending) {
      if (state.classified.has(index)) continue;
      const edge = facts.connections[index];
      if (edge !== undefined && examineEdge(state, index, edge)) attachedInPass = true;
    }
  }

  for (let i = pending.length - 1; i >= 0; i -= 1) {

    const index = pending[i];
    if (index !== undefined && state.classified.has(index)) pending.splice(i, 1);
  }
}

export function deriveChainTree(facts: LayoutFacts): ChainTree {
  const known = new Set(facts.systems.map((system) => system.systemId));
  const rootSystemId = resolveRoot(facts, known);
  if (rootSystemId === null) return EMPTY_TREE;

  const state: Derivation = {
    known,
    attached: new Set([rootSystemId]),
    parents: new Map(),
    childrenInOrder: new Map(),
    attachmentOrder: [rootSystemId],
    loopEdges: [],
    classified: new Set(),
  };

  const pending: number[] = [];
  for (const [index, edge] of facts.connections.entries()) {
    const attachedNow = examineEdge(state, index, edge);
    if (attachedNow) {
      drainPending(state, facts, pending);
    } else if (!state.classified.has(index)) {
      pending.push(index);
    }
  }

  const orphans = facts.systems
    .map((system) => system.systemId)
    .filter((systemId) => !state.attached.has(systemId));

  return {
    rootSystemId,
    parents: state.parents,
    childrenInOrder: state.childrenInOrder,
    attachmentOrder: state.attachmentOrder,
    loopEdges: state.loopEdges,
    orphans,
  };
}
