import type { TypeLabel } from '@/data/eve-data/queries';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { classifyBuildNode } from './industry-styles';
import type { BuildNode, BuildNodeDisplay } from './types';

// Turn the materialised dependency tree into the phased build-sequence view:
// a single root (the product) whose nested inputs descend through the build
// stages down to raw leaves. Pure — given the tree plus its labels, heights,
// and per-blueprint activities, it produces the nested nodes and a per-type
// display side-map. Quantities are multiplied down by each parent's runs so a
// node's quantity is the absolute units one run of the final product needs
// (the same marginal basis as the flat-materials ledger).
export function toBuildTree(args: {
  tree: TreeNode[];
  labels: Map<number, TypeLabel>;
  heights: Map<number, number>;
  activityByBlueprint: Map<number, number>;
  product: { typeId: number; quantityPerRun: number; activityId: number };
}): {
  buildTree: BuildNode[];
  buildNodeDisplay: Record<number, BuildNodeDisplay>;
  rootHeight: number;
} {
  const { tree, labels, heights, activityByBlueprint, product } = args;
  const display: Record<number, BuildNodeDisplay> = {};

  // Record a type's display once (per-type-stable, so the first wins). isRaw
  // and the recipe are global properties of a type, so a shared component is
  // described identically wherever it appears.
  const recordDisplay = (typeId: number, isRaw: boolean, activityId: number | undefined) => {
    if (display[typeId]) return;
    const l = labels.get(typeId);
    const cls = classifyBuildNode({
      isRaw,
      isRoot: false,
      activityId,
      groupName: l?.groupName ?? '',
      categoryName: l?.categoryName ?? '',
    });
    display[typeId] = {
      name: l?.name ?? `Type ${typeId}`,
      height: heights.get(typeId) ?? 0,
      isRaw,
      label: cls.label,
      tone: cls.tone,
    };
  };

  const walk = (nodes: TreeNode[], parentRuns: number): BuildNode[] =>
    nodes.map((node) => {
      const absQty = node.quantity * parentRuns;
      const isRaw = !node.producedBy;
      const activityId = node.producedBy
        ? activityByBlueprint.get(node.producedBy.blueprintTypeId)
        : undefined;
      recordDisplay(node.typeId, isRaw, activityId);
      const inputs = node.producedBy
        ? walk(node.inputs, absQty / node.producedBy.quantityPerRun)
        : [];
      return {
        typeId: node.typeId,
        // Exact (possibly fractional) units; rounding is a display concern. On
        // the marginal basis a single end product's share of a batch input can
        // be sub-unit — the renderer decides how to show that.
        quantity: absQty,
        hasBuildableChildren: inputs.some((c) => !display[c.typeId].isRaw),
        inputs,
      };
    });

  if (tree.length === 0) {
    return { buildTree: [], buildNodeDisplay: display, rootHeight: 0 };
  }

  const rootInputs = walk(tree, 1);
  // The product isn't a node inside its own tree, so its height is computed
  // here: one stage above the tallest of its direct inputs.
  const rootHeight = 1 + Math.max(...tree.map((n) => heights.get(n.typeId) ?? 0));
  const rl = labels.get(product.typeId);
  const rootCls = classifyBuildNode({
    isRaw: false,
    isRoot: true,
    activityId: product.activityId,
    groupName: rl?.groupName ?? '',
    categoryName: rl?.categoryName ?? '',
  });
  display[product.typeId] = {
    name: rl?.name ?? `Type ${product.typeId}`,
    height: rootHeight,
    isRaw: false,
    label: rootCls.label,
    tone: rootCls.tone,
  };

  const root: BuildNode = {
    typeId: product.typeId,
    quantity: product.quantityPerRun,
    hasBuildableChildren: rootInputs.some((c) => !display[c.typeId].isRaw),
    inputs: rootInputs,
  };
  return { buildTree: [root], buildNodeDisplay: display, rootHeight };
}
