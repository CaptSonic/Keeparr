import { describe, expect, it } from 'vitest';
import { filterHelpFaqs, helpContent } from './help-content';
import { SUPPORTED_LOCALES } from './i18n';

describe('user help', () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`provides complete tutorials and matching sections in ${locale}`, () => {
      const content = helpContent[locale];
      expect(content.steps).toHaveLength(4);
      expect(content.steps.map(({ actionHref }) => actionHref)).toEqual([
        '/library', '#practice-keep', '#practice-release', '#gates',
      ]);
      expect(content.basics).toHaveLength(6);
      expect(content.gates).toHaveLength(6);
      expect(content.seasons).toHaveLength(4);
      expect(content.seasons.map(({ id }) => id)).toEqual(['select', 'scope', 'review', 'restore']);
      expect(content.faqs.length).toBeGreaterThanOrEqual(8);
      for (const step of content.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.text.length).toBeGreaterThan(0);
        expect(step.action.length).toBeGreaterThan(0);
      }
      for (const choice of ['keep', 'skip', 'release'] as const) {
        expect(content.choices[choice]).toBeTruthy();
        expect(content.outcomes[choice]).toBeTruthy();
      }
      expect(content.outcomes.none).toBeTruthy();
      expect(content.basics.map(({ id }) => id)).toEqual(helpContent.en.basics.map(({ id }) => id));
      expect(content.gates.map(({ id }) => id)).toEqual(helpContent.en.gates.map(({ id }) => id));
    });

    it(`returns all questions for empty search in ${locale}`, () => {
      expect(filterHelpFaqs(locale, '  ')).toEqual(helpContent[locale].faqs);
    });

    it(`does not expose integration names in ${locale}`, () => {
      expect(JSON.stringify(helpContent[locale])).not.toMatch(/Plex|Tautulli|Sonarr|Radarr|Maintainerr|Seerr|Jellyfin|Emby|Agregarr/i);
    });
  }

  it('searches German questions and answers without case sensitivity', () => {
    const result = filterHelpFaqs('de', '  BEHALTEN   FREIGABE ');
    expect(result.length).toBeGreaterThan(0);
    for (const faq of result) {
      expect(`${faq.question} ${faq.answer}`.toLowerCase()).toContain('behalten');
      expect(`${faq.question} ${faq.answer}`.toLowerCase()).toContain('freigabe');
    }
    expect(filterHelpFaqs('de', 'Wiedergabestatus')).toHaveLength(1);
  });

  it('searches English content and handles unmatched searches', () => {
    expect(filterHelpFaqs('en', 'FILTERS').length).toBeGreaterThan(0);
    expect(filterHelpFaqs('en', 'no-such-topic')).toEqual([]);
    expect(filterHelpFaqs('de', 'no-such-topic')).toEqual([]);
  });

  it('describes configurable defaults rather than promising site settings', () => {
    expect(helpContent.de.gatesNote).toContain('Standardwerte');
    expect(helpContent.en.gatesNote).toContain('configurable defaults');
    expect(helpContent.de.gatesNote).toContain('separater Vorgang');
    expect(helpContent.en.gatesNote).toContain('separate process');
  });

  it('makes season deletion discoverable in both languages', () => {
    expect(filterHelpFaqs('de', 'Staffellöschung').length).toBeGreaterThanOrEqual(2);
    expect(filterHelpFaqs('en', 'season deletion').length).toBeGreaterThanOrEqual(2);
    expect(filterHelpFaqs('de', 'archivierte Folgen')).toHaveLength(1);
    expect(filterHelpFaqs('en', 'archived episodes')).toHaveLength(1);
  });

  it('does not promise backups, immediate restoration or individual season selection', () => {
    expect(helpContent.de.seasonsNote).toContain('keine Sicherungskopie');
    expect(helpContent.en.seasonsNote).toContain('does not mean a backup');
    expect(helpContent.de.seasons.find(({ id }) => id === 'scope')?.text).toContain('nicht einzelne Staffeln');
    expect(helpContent.en.seasons.find(({ id }) => id === 'scope')?.text).toContain('does not let you select individual seasons');
    expect(helpContent.de.seasons.find(({ id }) => id === 'restore')?.text).toContain('nicht sofort');
    expect(helpContent.en.seasons.find(({ id }) => id === 'restore')?.text).toContain('not immediately');
  });
});