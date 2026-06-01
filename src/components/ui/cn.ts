import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type { ClassValue };

// Joins class names AND resolves Tailwind conflicts: when a consumer's
// `className` overlaps a primitive's own utilities (same property group),
// twMerge keeps the last one so the override actually wins instead of both
// shipping and the cascade deciding. clsx handles the conditional/falsy forms.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
