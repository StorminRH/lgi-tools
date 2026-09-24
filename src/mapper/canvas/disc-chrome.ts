export const SYSTEM_DISC_SIZE = 55;
const TRACK_ICON_PX = 14;
const TRACK_AIR_GAP_PX = 4;
const TRACK_RADIUS_PX = SYSTEM_DISC_SIZE / 2 + TRACK_ICON_PX / 2 + TRACK_AIR_GAP_PX;
export const ICON_TRACK_CLEARANCE_PX = TRACK_RADIUS_PX + TRACK_ICON_PX / 2;
const TRACK_START_HEADING_RAD = Math.PI / 2;
const TRACK_SEAT_STEP_RAD = Math.PI / 4;
export const KSPACE_TITLE_GAP_PX = 6;

function cleanAxis(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

export function widgetSeatOffset(index: number): { readonly x: number; readonly y: number } {
  const heading = TRACK_START_HEADING_RAD + index * TRACK_SEAT_STEP_RAD;
  return {
    x: cleanAxis(TRACK_RADIUS_PX * Math.sin(heading)),
    y: cleanAxis(TRACK_RADIUS_PX * -Math.cos(heading)),
  };
}

export function kspaceCaptionOffset(): { readonly x: number; readonly y: number } {
  return { x: 0, y: -(SYSTEM_DISC_SIZE / 2 + KSPACE_TITLE_GAP_PX) };
}
