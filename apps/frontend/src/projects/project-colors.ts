import type { ProjectColor } from '@workboard/shared';

/**
 * Maps each closed-palette `ProjectColor` token to concrete design-system classes for the
 * project card accent, the color-picker swatch, and the Week board project badge. Full static
 * class strings are required so Tailwind's content scanner emits them (no dynamic class
 * construction). The tokens mirror the shared `PROJECT_COLORS` palette (data-model.md §Color
 * palette) — Tailwind's default color families of the same names.
 */
interface ColorClasses {
  /** Solid swatch fill (picker + card accent dot). */
  swatch: string;
  /** Badge/pill background + text used on the card header and the Week badge. */
  badge: string;
}

export const PROJECT_COLOR_CLASSES: Record<ProjectColor, ColorClasses> = {
  slate: { swatch: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700' },
  red: { swatch: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  amber: { swatch: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  green: { swatch: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  teal: { swatch: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' },
  blue: { swatch: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  violet: { swatch: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  pink: { swatch: 'bg-pink-500', badge: 'bg-pink-100 text-pink-700' },
};

/** Swatch fill class for a token (defaults to slate for safety). */
export function colorSwatch(color: ProjectColor): string {
  return (PROJECT_COLOR_CLASSES[color] ?? PROJECT_COLOR_CLASSES.slate).swatch;
}

/** Badge background+text class for a token (defaults to slate for safety). */
export function colorBadge(color: ProjectColor): string {
  return (PROJECT_COLOR_CLASSES[color] ?? PROJECT_COLOR_CLASSES.slate).badge;
}
