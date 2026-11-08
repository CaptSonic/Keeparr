import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollectionProtectionDetails } from './CollectionProtectionDetails';

const item = { title: 'Affected film', collectionBlockers: [
  { ratingKey: 'a', title: 'Protected film', year: 2011, reason: 'global_keep' },
  { ratingKey: 'b', title: 'Observing film', year: null, reason: 'collection_member_observing' },
] };

describe('CollectionProtectionDetails', () => {
  it('renders collapsed native details with German causes and an item-specific accessible name', () => {
    const html = renderToStaticMarkup(<CollectionProtectionDetails item={item} locale="de" />);
    expect(html).toContain('<details');
    expect(html).not.toContain(' open=');
    expect(html).toContain('aria-label="Collection-Schutz für Affected film"');
    expect(html).toContain('Schützende Filme (2)');
    expect(html).toContain('Protected film (2011)');
    expect(html).toContain('Durch ein globales Keep geschützt');
    expect(html).toContain('Beobachtungszeit noch nicht abgeschlossen');
    expect(html).toContain('Medien-ID: b');
    expect(html).not.toContain('(null)');
    expect(html).not.toContain('<button');
  });
  it('renders English labels and explains overlap protection without granting approval', () => {
    const html = renderToStaticMarkup(<CollectionProtectionDetails item={item} locale="en" />);
    expect(html).toContain('Protecting movies (2)');
    expect(html).toContain('Protected by a global Keep');
    expect(html).toContain('overlapping collections');
    expect(html).toContain('does not grant approval');
    expect(html).toContain('aria-label="Protection reasons"');
  });
  it('renders nothing when optional causes are absent or empty', () => {
    expect(renderToStaticMarkup(<CollectionProtectionDetails item={{ title: 'Old preview' }} locale="de" />)).toBe('');
    expect(renderToStaticMarkup(<CollectionProtectionDetails item={{ title: 'No causes', collectionBlockers: [] }} locale="en" />)).toBe('');
  });
  it('escapes remote titles and media ids and uses a safe label for unknown reasons', () => {
    const html = renderToStaticMarkup(<CollectionProtectionDetails item={{ title: 'Test', collectionBlockers: [
      { ratingKey: '<id>', title: '<script>alert(1)</script>', year: null, reason: 'future_reason' },
    ] }} locale="de" />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;id&gt;');
    expect(html).toContain('Unbekannter Prüfgrund');
  });
});