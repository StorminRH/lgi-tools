import type { AvailableStructure } from '../types';

// The per-source structure segments of a location <select> (3.7.13.2) —
// shared by the build-location and refinery dropdowns so the two segmented
// lists can't drift. Renders nothing for an empty segment; the caller owns
// the surrounding <select>, its default option, and any trailing entries.
export function StructureOptgroups({ structures }: { structures: AvailableStructure[] }) {
  const corp = structures.filter((s) => s.source === 'corp');
  const custom = structures.filter((s) => s.source === 'custom');
  return (
    <>
      {corp.length > 0 && (
        <optgroup label="Corp structures">
          {corp.map((s) => (
            <option key={s.id} value={`structure:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
      {custom.length > 0 && (
        <optgroup label="Custom structures">
          {custom.map((s) => (
            <option key={s.id} value={`structure:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
