import { describe, expect, it } from 'vitest';
import {
  detectLocale,
  formatBytes,
  formatDate,
  formatNumber,
  formatRelativeTime,
  interpolate,
  normalizeLocale,
} from './i18n';

describe('locale selection', () => {
  it('normalizes supported language and region variants', () => {
    expect(normalizeLocale(' DE-de ')).toBe('de');
    expect(normalizeLocale('en_US')).toBe('en');
    expect(normalizeLocale('fr-FR')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });

  it('uses the first supported browser language and otherwise English', () => {
    expect(detectLocale(['fr-FR', 'de-AT', 'en-US'])).toBe('de');
    expect(detectLocale(['fr-FR'])).toBe('en');
  });
});

describe('messages and locale formatters', () => {
  it('interpolates known placeholders and preserves unknown ones', () => {
    expect(interpolate('Hello {name}, {missing}', { name: 'Ada' })).toBe('Hello Ada, {missing}');
  });

  it('formats numbers and bytes with explicit German and English separators', () => {
    expect(formatNumber(1234.5, 'de')).toContain('1.234,5');
    expect(formatNumber(1234.5, 'en')).toContain('1,234.5');
    expect(formatBytes(1536, 'de')).toBe('1,5 KB');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(0, 'de')).toBe('0 B');
  });

  it('formats dates with the requested locale', () => {
    const value = Date.UTC(2026, 6, 21, 12, 0, 0);
    const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' };
    expect(formatDate(value, 'de', options)).toBe('21.07.2026');
    expect(formatDate(value, 'en', options)).toBe('07/21/2026');
  });

  it('formats relative time deterministically', () => {
    const now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const nowSeconds = Math.floor(now / 1000);
    expect(formatRelativeTime(nowSeconds - 2 * 3600, 'de', now)).toBe('vor 2 Stunden');
    expect(formatRelativeTime(nowSeconds + 86400, 'en', now)).toBe('tomorrow');
  });
});