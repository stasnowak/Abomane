/** Money helpers. All amounts are integer euro cents. */

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EUR_NO_DECIMALS = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats cents as `1.234,56 €`. */
export function formatEur(cents: number): string {
  return EUR.format(Math.round(cents) / 100);
}

/** Formats cents as `1.235 €`, for dense chart labels. */
export function formatEurRounded(cents: number): string {
  return EUR_NO_DECIMALS.format(Math.round(cents) / 100);
}

/**
 * Parses a user-entered amount into cents.
 *
 * Accepts both German (`1.234,56`) and plain (`1234.56`) notation, with or
 * without a currency symbol. Returns null when the input is not a valid amount.
 */
export function parseEur(input: string): number | null {
  const cleaned = input.trim().replace(/[€\s]/g, '');
  if (cleaned === '') return null;

  let normalized: string;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal separator.
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Renders cents as a plain editable string, e.g. `12,99`. */
export function centsToInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2).replace('.', ',');
}
