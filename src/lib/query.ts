/**
 * Maps overview URL parameters to a period and cost mode.
 *
 * The overview keeps its whole state in the URL so navigation works without
 * JavaScript and any view can be bookmarked. Anything unparseable falls back to
 * the default rather than erroring: a hand-edited URL should never break the page.
 */
import {
  makeIso,
  parsePeriodKey,
  periodContaining,
  periodKey,
  shiftPeriod,
  splitIso,
  type Period,
  type PeriodKind,
} from './dates.js';
import type { CostMode } from './schedule.js';

export interface OverviewQuery {
  kind: PeriodKind;
  period: Period;
  mode: CostMode;
}

const KINDS: PeriodKind[] = ['month', 'quarter', 'year'];
const MODES: CostMode[] = ['normalized', 'actual'];

export function parseOverviewQuery(params: URLSearchParams, today: string): OverviewQuery {
  const kindParam = params.get('view');
  const kind = KINDS.includes(kindParam as PeriodKind) ? (kindParam as PeriodKind) : 'month';

  const modeParam = params.get('mode');
  const mode = MODES.includes(modeParam as CostMode) ? (modeParam as CostMode) : 'normalized';

  const periodParam = params.get('period');
  const period =
    (periodParam && parsePeriodKey(kind, periodParam)) || periodContaining(kind, today);

  return { kind, period, mode };
}

/** Builds an overview link, keeping whatever is not overridden. */
export function overviewHref(
  current: OverviewQuery,
  overrides: Partial<{ kind: PeriodKind; period: Period; mode: CostMode }> = {},
): string {
  const kind = overrides.kind ?? current.kind;
  // Switching the view keeps the same point in time rather than resetting to
  // today, so "September" becomes "Q3" instead of jumping somewhere unrelated.
  const period =
    overrides.period ??
    (overrides.kind && overrides.kind !== current.kind
      ? periodContaining(overrides.kind, current.period.start)
      : current.period);
  const mode = overrides.mode ?? current.mode;

  const params = new URLSearchParams({ view: kind, period: periodKey(period), mode });
  return `/?${params.toString()}`;
}

/**
 * The comparison strip shown under the totals: twelve months, four quarters, or
 * five years, so a spike is visible next to its neighbours.
 */
export function bucketsFor(period: Period): Period[] {
  const [year] = splitIso(period.start);

  if (period.kind === 'month') {
    return Array.from({ length: 12 }, (_, index) =>
      periodContaining('month', makeIso(year, index + 1, 1)),
    );
  }
  if (period.kind === 'quarter') {
    return Array.from({ length: 4 }, (_, index) =>
      periodContaining('quarter', makeIso(year, index * 3 + 1, 1)),
    );
  }
  return Array.from({ length: 5 }, (_, index) => shiftPeriod(period, index - 4));
}
