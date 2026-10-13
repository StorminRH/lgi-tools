'use client';

import { useRef, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { atlasCameraFollow, atlasClickFocus } from '@/lib/preferences';
import type { CameraFocusRequest } from '../canvas/use-camera-follow';
import { DEFAULT_FOG_CONFIG, type FogConfig } from '../fog/fog-model';
import { HALO_PINNED_LIMITS, type HaloLimits } from '../halo/halo-model';
import {
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
} from '../layout/layout-contract';
import {
  DEFAULT_MOTION_CONFIG,
  type MotionConfig,
} from '../motion/motion-contract';

export function useChainDials() {
  const [follow] = usePreference(atlasCameraFollow);
  const [focusOnClick] = usePreference(atlasClickFocus);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(null);
  const focusTokenRef = useRef(0);
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  const [motionConfig, setMotionConfig] = useState<MotionConfig>(
    DEFAULT_MOTION_CONFIG,
  );
  const [haloLimits, setHaloLimits] = useState<HaloLimits>(HALO_PINNED_LIMITS);
  const [fogConfig, setFogConfig] = useState<FogConfig>(DEFAULT_FOG_CONFIG);

  return {
    config,
    fogConfig,
    focusOnClick,
    focusRequest,
    focusTokenRef,
    follow,
    haloLimits,
    motionConfig,
    setConfig,
    setFocusRequest,
    setFogConfig,
    setHaloLimits,
    setMotionConfig,
  };
}
