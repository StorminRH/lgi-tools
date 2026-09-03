import type { TypeLabel } from '@/data/eve-data/queries';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { classifyBuildNode } from './industry-styles';
import type { BuildNode, BuildNodeDisplay } from './types';

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
        quantity: absQty,
        inputs,
      };
    });

  if (tree.length === 0) {
    return { buildTree: [], buildNodeDisplay: display, rootHeight: 0 };
  }

  const rootInputs = walk(tree, 1);
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
    inputs: rootInputs,
  };
  return { buildTree: [root], buildNodeDisplay: display, rootHeight };
}
