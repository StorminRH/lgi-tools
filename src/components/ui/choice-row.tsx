import { useId, type ReactElement, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * The clickable label row around a checkbox, switch or radio. The whole row
 * toggles its control, and a disabled control dims the row and shows a
 * not-allowed cursor.
 */
export const choiceRow =
  'flex cursor-pointer gap-2.5 font-ui text-ui text-text has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50';

/**
 * How a Checkbox or Switch is named. `label` alone names a bare control that
 * its caller labels some other way. `children` draw a visible label row whose
 * text names the control; a `label` beside them overrides that name, for rows
 * whose trailing detail would read badly. Start an override with the row's
 * visible text so speech input still finds the control.
 */
export type ChoiceLabel =
  | { label: string; children?: undefined; rowClassName?: undefined }
  | { children: NonNullable<ReactNode>; label?: string; rowClassName?: string };

/**
 * Renders `control` under its ChoiceLabel. Base UI points a wrapped control's
 * aria-labelledby at the label around it, which outranks any aria-label, so a
 * row names its control explicitly: by the row itself, or by a hidden span
 * that holds the `label` override. `bare` tells the control it has no row to
 * dim it when disabled.
 */
export function ChoiceRow({
  label,
  children,
  rowClassName,
  control,
}: ChoiceLabel & {
  control: (
    name: { 'aria-label'?: string; 'aria-labelledby'?: string },
    bare: boolean,
  ) => ReactElement;
}) {
  const id = useId();
  if (children === undefined) return control({ 'aria-label': label }, true);
  const nameId = label === undefined ? id : `${id}-name`;
  return (
    <label
      id={label === undefined ? id : undefined}
      className={cn(choiceRow, 'items-center', rowClassName)}
    >
      {control({ 'aria-labelledby': nameId }, false)}
      {label === undefined ? null : (
        <span id={nameId} hidden>
          {label}
        </span>
      )}
      {children}
    </label>
  );
}
