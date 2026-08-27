'use client';

import { useEffect, useRef, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import {
  atlasAutoLayout,
  atlasCameraFollow,
  atlasClickFocus,
} from '@/lib/preferences';
import type { CameraFocusRequest } from '../canvas/use-camera-follow';
import { DEFAULT_FOG_CONFIG, type FogConfig } from '../fog/fog-model';
import { HALO_PINNED_LIMITS, type HaloLimits } from '../halo/halo-model';
import {
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
} from '../layout/layout-contract';
import {
  DEFAULT_MOTION_CONFIG,
  motionCssProperties,
  type MotionConfig,
} from '../motion/motion-contract';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();

export function useChainDials() {
  const [dragging, setDragging] = useState<ReadonlySet<number>>(EMPTY_DRAG_SET);
  // Mirrors `dragging` for use inside the sync effect without making the effect depend on it: a drag
  // start must not itself trigger a resync.
  const draggingRef = useRef<ReadonlySet<number>>(EMPTY_DRAG_SET);
  // Auto layout / camera follow / click focus: autosaved preferences
  // (portrait menu). Auto layout ON = nodes locked to the computed layout.
  const [locked] = usePreference(atlasAutoLayout);
  const [follow] = usePreference(atlasCameraFollow);
  const [focusOnClick] = usePreference(atlasClickFocus);
  // Re-lock releases user placements only on transition to locked (not initial mount).
  const wasLockedRef = useRef(locked);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(null);
  const focusTokenRef = useRef(0);
  // Live dial state — local presentation only; never synchronized.
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  // Motion dials — presentation only, a separate object from LayoutConfig by
  // contract (HC-4): no motion field may enter the layout fingerprint.
  const [motionConfig, setMotionConfig] = useState<MotionConfig>(
    DEFAULT_MOTION_CONFIG,
  );
  // Halo/fog G-1 tuning dials (dev-only panel): both start at the pinned
  // constants, so production renders exactly the pins.
  const [haloLimits, setHaloLimits] = useState<HaloLimits>(HALO_PINNED_LIMITS);
  const [fogConfig, setFogConfig] = useState<FogConfig>(DEFAULT_FOG_CONFIG);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = shellRef.current;
    if (element === null) return;
    for (const [property, value] of Object.entries(
      motionCssProperties(motionConfig),
    )) {
      element.style.setProperty(property, value);
    }
  }, [motionConfig]);

  return {
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
    wasLockedRef,
  };
}
