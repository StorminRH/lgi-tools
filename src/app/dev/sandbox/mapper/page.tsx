import { SandboxHeader } from '../_shared/sandbox-ui';
import { MapperDemo } from './MapperDemo';

// OOB.4.1 renderer/interaction spike for the future v4.0 wormhole mapper. No DB
// read and no request-time input (the graph + list data are hardcoded), so this
// leaf prerenders fully static. Like the other sandbox leaves it carries no auth
// gate; the layout's metadata noindexes it.

export default function MapperSpikePage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Wormhole Mapper — Renderer Spike"
        subtitle="React Flow graph + dnd-kit reorder · throwaway evaluation"
      />
      <MapperDemo />
    </div>
  );
}
