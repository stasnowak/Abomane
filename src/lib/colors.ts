/**
 * A fixed palette for categories.
 *
 * Tailwind compiles only the class names it can see in the source, so category
 * colours must come from this static map rather than being interpolated from a
 * database value.
 */
export interface Swatch {
  /** Solid fill, used for chart bars. */
  bar: string;
  /** Tinted background plus readable text, used for badges. */
  badge: string;
  /** Small circular dot. */
  dot: string;
}

export const CATEGORY_COLORS: Record<string, Swatch> = {
  slate: {
    bar: 'bg-slate-400 dark:bg-slate-500',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  violet: {
    bar: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  blue: {
    bar: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  teal: {
    bar: 'bg-teal-500',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  emerald: {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  amber: {
    bar: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  rose: {
    bar: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  fuchsia: {
    bar: 'bg-fuchsia-500',
    badge: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
    dot: 'bg-fuchsia-500',
  },
};

export const COLOR_NAMES = Object.keys(CATEGORY_COLORS);

export function swatch(color: string | null | undefined): Swatch {
  return CATEGORY_COLORS[color ?? 'slate'] ?? CATEGORY_COLORS.slate!;
}
