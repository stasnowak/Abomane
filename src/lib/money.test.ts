import { describe, expect, it } from 'vitest';
import { centsToInput, formatEur, parseEur } from './money.js';

describe('formatEur', () => {
  it('formats with German separators', () => {
    expect(formatEur(123456).replace(/\s/g, ' ')).toBe('1.234,56 €');
    expect(formatEur(999).replace(/\s/g, ' ')).toBe('9,99 €');
    expect(formatEur(0).replace(/\s/g, ' ')).toBe('0,00 €');
  });
});

describe('parseEur', () => {
  it('accepts German and plain notation', () => {
    expect(parseEur('12,99')).toBe(1299);
    expect(parseEur('12.99')).toBe(1299);
    expect(parseEur('1.234,56')).toBe(123456);
    expect(parseEur('1,234.56')).toBe(123456);
    expect(parseEur(' 9 € ')).toBe(900);
  });

  it('rejects nonsense', () => {
    expect(parseEur('')).toBeNull();
    expect(parseEur('abc')).toBeNull();
    expect(parseEur('1,2,3')).toBeNull();
  });

  it('round-trips through the input format', () => {
    expect(parseEur(centsToInput(123456))).toBe(123456);
  });
});
