// Tree derivation: the first stage of the layout kernel.
//
// CONTRACT (session 4.0.3.1.1, plan "Interfaces and contracts", replay mechanism operator-settled
// 2026-08-01): connections are replayed one at a time in creation order, attaching immediately when
// exactly one endpoint is attached (the attached endpoint becomes the parent); after every
// attachment, earlier still-unclassified connections are re-examined (in creation order, to a
// fixpoint) so a connection that was blocked attaches the moment its endpoint arrives. Every
// connection is classified exactly once — examined while unclassified it becomes a tree edge when
// exactly one endpoint is attached, becomes loop-closing when both already are, and stays
// unclassified when neither is; a classified edge is never re-read. Loop-closing edges (including
// duplicates and self edges) have zero positional influence (contract DC-4).
//
// The replay order is what makes growth append-only: appending facts can only append attachments,
// never reorder existing ones, so a new scan cannot re-parent or re-index a system already on the
// map. (The plan's original full-pass rescan let a later connection preempt an earlier blocked one,
// which moved existing nodes on 6 of 364 measured arrivals; the operator adopted this replay as the
// correction — recorded in the session as-built.)
import type { LayoutEdge, LayoutFacts } from './layout-contract';

/** The spanning structure an engine lays out: who hangs from whom, and what has no place yet. */
export interface ChainTree {
  /** The resolved root, or `null` when the facts hold no systems. */
  readonly rootSystemId: number | null;
  /** Child system id → parent system id, for every attached non-root system. */
  readonly parents: ReadonlyMap<number, number>;
  /** Parent system id → children in attachment order; only parents with children have entries. */
  readonly childrenInOrder: ReadonlyMap<number, readonly number[]>;
  /**
   * Every attached system, root first, in the order the scan attached them. New facts only append
   * attachments (or re-derive earlier ones identically), which is what lets an engine place nodes
   * in this order and guarantee that an arrival never displaces an existing node.
   */
  readonly attachmentOrder: readonly number[];
  /** Connections joining two already-attached systems; drawn as edges, never placed from. */
  readonly loopEdges: readonly LayoutEdge[];
  /** Systems with no path to the root yet, in creation order; parked in the overflow sector. */
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

/**
 * Resolves the root: a `rootSystemId` override naming a present system wins; otherwise the first
 * system in creation order. An absent override is ignored fail-safe — deterministic, never a throw.
 */
function resolveRoot(facts: LayoutFacts, known: ReadonlySet<number>): number | null {
  if (facts.rootSystemId !== undefined && known.has(facts.rootSystemId)) {
    return facts.rootSystemId;
  }
  return facts.systems[0]?.systemId ?? null;
}

/** The mutable working state of one derivation; every scan pass reads and grows it. */
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

/**
 * Examines one unclassified connection: classifies it as loop-closing when both endpoints are
 * attached, attaches (and classifies) when exactly one is, and leaves it unclassified when
 * neither is or the attachable endpoint is unknown. Returns whether it attached a system.
 */
function examineEdge(state: Derivation, index: number, edge: LayoutEdge): boolean {
  const fromAttached = state.attached.has(edge.fromSystemId);
  const toAttached = state.attached.has(edge.toSystemId);
  if (fromAttached && toAttached) {
    // Covers duplicate edges between one pair and self edges on an attached system.
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

/**
 * Re-examines earlier still-unclassified connections (in creation order) until a pass attaches
 * nothing — the drain step that lets a blocked connection attach the moment its endpoint arrives.
 */
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
  // Classified indices never re-examine; compacting keeps later drains proportional to the
  // genuinely open set.
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    // The pending list only ever holds valid indices.
    const index = pending[i];
    if (index !== undefined && state.classified.has(index)) pending.splice(i, 1);
  }
}

/**
 * Derives the spanning tree, loop-edge set, and orphan set from synchronized facts.
 *
 * Pure and total over arbitrary facts: unknown-endpoint connections (a system's row has not drained
 * yet) can never attach anything and simply stay unclassified with zero influence; when the missing
 * system arrives, the same scan attaches it — an ordinary spawn move, never a crash. The scan
 * repeats in full passes until a pass makes no new attachment.
 */
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
