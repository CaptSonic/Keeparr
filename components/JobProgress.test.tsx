import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import JobProgress from './JobProgress';

vi.mock('./LocaleProvider', () => ({ useLocale: () => ({ locale: 'de' }) }));

const progress = { status: 'running' as const, phase: 'Checking', phaseDe: 'Prüfen', completed: 5, total: 12, updatedAt: 1 };

describe('JobProgress', () => {
  it('renders a localized accessible progress bar for known totals', () => {
    const html = renderToStaticMarkup(<JobProgress progress={progress} />);
    expect(html).toContain('Prüfen');
    expect(html).toContain('aria-valuenow="41"');
    expect(html).toContain('5 / 12 (41%)');
  });
  it('does not fabricate a percentage for cursor pagination or queued work', () => {
    const html = renderToStaticMarkup(<JobProgress progress={{ ...progress, total: null }} />);
    expect(html).not.toContain('aria-valuenow');
    const queued = renderToStaticMarkup(<JobProgress progress={progress} queued />);
    expect(queued).toContain('Wartet auf gemeinsame Ressourcen');
    expect(queued).not.toContain('41%');
  });
  it('retains the last acknowledged count and failed phase instead of showing success', () => {
    const html = renderToStaticMarkup(<JobProgress progress={{ ...progress, status: 'error' }} />);
    expect(html).toContain('Abgebrochen');
    expect(html).toContain('Prüfen');
    expect(html).toContain('5 / 12');
  });
});