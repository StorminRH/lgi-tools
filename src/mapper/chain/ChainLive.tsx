'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { HomePrompt } from '../authoring/HomePrompt';
import { MapAuthoringOverlay } from '../authoring/MapAuthoringOverlay';
import { NodeAddMenu } from '../authoring/NodeAddMenu';
import { RightsTransitionToast } from '../authoring/RightsTransitionToast';
import { EdgeContextMenu } from '../canvas/EdgeContextMenu';
import { MapControls } from '../canvas/MapControls';
import { CameraFollowHost } from '../canvas/use-camera-follow';
import { BROWSER_MOTION_SEAMS } from '../motion/use-motion';
import { SignatureProvider } from '../signatures/SignatureProvider';
import { JumpDoorbellObserver } from '../tracking/JumpDoorbellObserver';
import { OutboundArrowProvider } from '../tracking/OutboundArrowProvider';
import { MapPresenceProvider } from '../tracking/PresenceProvider';
import { TrackingHeartbeat } from '../tracking/TrackingControls';
import { useTrackedSystemTarget } from '../tracking/use-tracked-system';
import { MapWindowLayer } from '../windows/MapWindowLayer';
import { persistentWindowSystemId } from '../windows/window-model';
import { MotionLayer } from './MotionLayer';
import { NoMapAccess } from './NoMapAccess';
import { useChainAuthoringMutations } from './optimistic-authoring';
import { useAuthoringMenus } from './use-authoring-menus';
import { useChainDials } from './use-chain-dials';
import { useChainDrag } from './use-chain-drag';
import { useChainFocusMenus } from './use-chain-focus-menus';
import { useChainNodeSync } from './use-chain-node-sync';
import { useMapChain } from './use-map-chain';

export function ChainLive({ mapId }: { readonly mapId: string }) {
  const {
    config,
    dragging,
    draggingRef,
    fogConfig,
    focusOnClick,
    focusRequest,
    focusTokenRef,
    follow,
    haloLimits,
    locked,
    motionConfig,
    setConfig,
    setDragging,
    setFocusRequest,
    setFogConfig,
    setHaloLimits,
    setMotionConfig,
    shellRef,
  } = useChainDials();
  const wasLockedRef = useRef(locked);

  const {
    access,
    canEdit,
    systemsComplete,
    liveSystemCount,
    connectionDetails,
    unresolvedHoles,
    connectionPresentationNow,
    events,
    state,
    intents,
    labelOf,
    treeParents,
    rootSystemId,
    halo,
    stubs,
    neighboursOf,
    pinPlacement,
    releasePlacements,
  } = useMapChain(mapId, dragging, config, haloLimits);
  useEffect(() => {
    if (locked && !wasLockedRef.current) releasePlacements();
    wasLockedRef.current = locked;
  }, [locked, releasePlacements]);
  const authoring = useChainAuthoringMutations();
  const menus = useAuthoringMenus(canEdit);
  const {
    deselectNodes,
    drawnSystemIds,
    edges,
    nodeIds,
    onNodesChange,
    truth,
  } = useChainNodeSync(
    state,
    labelOf,
    halo,
    stubs,
    treeParents,
    connectionPresentationNow,
    draggingRef,
  );
  const {
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDragStop,
  } = useChainDrag(draggingRef, setDragging, pinPlacement);
  const {
    edgeActions,
    onEdgeContextMenu,
    onNodeClick,
    onNodeContextMenu,
  } = useChainFocusMenus(
    canEdit,
    menus,
    mapId,
    authoring,
    focusTokenRef,
    setFocusRequest,
  );

  const showHomePrompt =
    canEdit === true && systemsComplete && liveSystemCount === 0;
  const trackedSystem = useTrackedSystemTarget(mapId);
  const windowSystemId = persistentWindowSystemId(trackedSystem, rootSystemId);

  if (access === false) return <NoMapAccess />;

  return (
    <div
      ref={shellRef}
      className="relative h-full w-full"
      data-map-shell=""
      data-map-can-edit={canEdit === true ? 'true' : 'false'}
    >
      <MapPresenceProvider mapId={mapId}>
        <SignatureProvider
          mapId={mapId}
          scannerSystemId={windowSystemId}
          pasteTarget={trackedSystem}
          canEdit={canEdit === true}
          connectionDetails={connectionDetails}
          unresolvedHoles={unresolvedHoles}
          authoring={authoring}
          panelTarget={menus.panelTarget}
          onPanelTargetChange={menus.setPanelTarget}
        >
          <ReactFlowProvider initialMinZoom={0.2} initialMaxZoom={2.5}>
          <OutboundArrowProvider
            drawnSystemIds={drawnSystemIds}
            edges={edges}
            neighboursOf={neighboursOf}
          >
            <MotionLayer
              truth={truth}
              intents={intents}
              access={access}
              dragging={dragging}
              motionConfig={motionConfig}
              fogConfig={fogConfig}
              canEdit={canEdit === true}
              nodesDraggable={!locked}
              onNodesChange={onNodesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onSelectionDragStart={onSelectionDragStart}
              onSelectionDragStop={onSelectionDragStop}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
            >
              <MapControls
                config={config}
                onConfigChange={setConfig}
                motion={motionConfig}
                onMotionChange={setMotionConfig}
                halo={haloLimits}
                onHaloChange={setHaloLimits}
                fog={fogConfig}
                onFogChange={setFogConfig}
              />
              {access === true ? <TrackingHeartbeat mapId={mapId} /> : null}
              <CameraFollowHost
                intents={intents}
                follow={follow}
                dragging={dragging}
                nodeIds={nodeIds}
                systems={state.systems}
                config={motionConfig}
                prefersReducedMotion={BROWSER_MOTION_SEAMS.prefersReducedMotion}
                focusRequest={focusRequest}
                focusEnabled={focusOnClick}
              />
            </MotionLayer>
          </OutboundArrowProvider>
          <MapWindowLayer
            dockSystemId={windowSystemId}
            onDeselect={deselectNodes}
          />
          <RightsTransitionToast canEdit={canEdit} />
          {canEdit === true ? <JumpDoorbellObserver mapId={mapId} /> : null}
          <MapAuthoringOverlay
            mapId={mapId}
            canEdit={canEdit === true}
            connectionPresentationNow={connectionPresentationNow}
            events={events}
            authoring={authoring}
          />
          {canEdit === true ? (
            <>
              <EdgeContextMenu
                menu={menus.edgeMenu}
                onOpenChange={(open) => {
                  if (!open) menus.closeEdgeMenu();
                }}
                onEdit={edgeActions.onEdit}
                onDelete={edgeActions.onDelete}
              />
              <NodeAddMenu
                mapId={mapId}
                menu={menus.nodeMenu}
                onMenuOpenChange={(open) => {
                  if (!open) menus.closeNodeMenu();
                }}
                onAdd={(fromSystemId, toSystemId) => {
                  void authoring.addSystemFromNode({
                    mapId,
                    fromSystemId,
                    toSystemId,
                  });
                }}
              />
            </>
          ) : null}
          </ReactFlowProvider>
        </SignatureProvider>
        {showHomePrompt ? (
          <HomePrompt
            mapId={mapId}
            onPick={(systemId) => {
              void authoring.setHomeSystem({ mapId, systemId });
            }}
          />
        ) : null}
      </MapPresenceProvider>
    </div>
  );
}
