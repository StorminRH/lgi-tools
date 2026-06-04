import { SandboxHeader } from '../../_shared/sandbox-ui';
import { FlowExplorer } from './FlowExplorer';

// Focused explorer for the flow-connector tree: switch between sample builds of
// different sizes, drill into nodes (with a selectable zoom transition), and see
// the fit-to-width / grow-vertically layout on a large capital tree. Static
// shell; the graph is a client island over hardcoded sample structures.

export default function FlowExplorerPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Flow Connectors — Explorer"
        subtitle="Rifter · Loki · Archon · click to drill · fits width, grows down"
      />
      <FlowExplorer />
    </div>
  );
}
