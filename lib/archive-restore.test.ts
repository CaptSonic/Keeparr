import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import { repairArchivePlaceholder } from './archive-restore';
import {
  listArchiveEpisodes,
  replacePreparedArchiveEpisodes,
  setArchiveEpisodesStatus,
} from './queries';
import { setArchivePlaceholderConfig, setSonarrInstances } from './settings';

let temp: string;
let archiveRoot: string;
let templatePath: string;

beforeEach(() => {
  __setTestDbToMemory();
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeparr-placeholder-repair-'));
  archiveRoot = path.join(temp, 'archive');
  templatePath = path.join(temp, 'placeholder.mp4');
  fs.mkdirSync(archiveRoot);
  fs.writeFileSync(templatePath, 'placeholder');
  setSonarrInstances([{ id: 's1', name: 'Sonarr', url: 'http://sonarr', apiKey: 'key' }]);
  setArchivePlaceholderConfig({
    enabled: true,
    archiveRoot,
    plexArchiveRoot: '/plex/archive',
    templatePath,
    automaticRestore: true,
    plexRefresh: false,
    webhookSecret: 'secret',
  });
  const placeholderRelPath = path.join('Show', 'Season 01', 'Show - S01E01 - Archived.mp4');
  replacePreparedArchiveEpisodes([{
    episodeId: 101,
    instanceId: 's1',
    ratingKey: 'show',
    sectionId: '1',
    seriesId: 7,
    seriesTitle: 'Show',
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: 'One',
    originalFileId: 11,
    originalPath: '/tv/Show/Season 01/episode.mkv',
    originalRelativePath: 'Season 01/episode.mkv',
    placeholderPath: path.join(archiveRoot, placeholderRelPath),
    placeholderRelPath,
    plexPlaceholderPath: '/plex/archive/Show/Season 01/Show - S01E01 - Archived.mp4',
  }]);
  setArchiveEpisodesStatus('s1', [101], 'failed', 'timeout');
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(temp, { recursive: true, force: true });
});
afterAll(() => __closeDb());

describe('failed placeholder repair', () => {
  it('publishes the placeholder only after Sonarr confirms the real file is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/episode?')) {
        return new Response(JSON.stringify([{
          id: 101, seriesId: 7, seasonNumber: 1, episodeNumber: 1,
          monitored: true, hasFile: false,
        }]), { headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/episodefile?')) {
        return new Response('[]', { headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    await expect(repairArchivePlaceholder({ instanceId: 's1', episodeId: 101 }))
      .resolves.toEqual({ ok: true, repaired: 1 });
    const row = listArchiveEpisodes()[0];
    expect(row.status).toBe('archived');
    expect(fs.readFileSync(row.placeholderPath, 'utf8')).toBe('placeholder');
  });

  it('refuses repair while Sonarr still reports the real file', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.includes('/episodefile?')
        ? [{ id: 11, seriesId: 7 }]
        : [{ id: 101, seriesId: 7, hasFile: true, episodeFileId: 11 }];
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    }));

    await expect(repairArchivePlaceholder({ instanceId: 's1', episodeId: 101 }))
      .resolves.toMatchObject({ ok: false, error: 'original_file_still_present' });
    const row = listArchiveEpisodes()[0];
    expect(row.status).toBe('failed');
    expect(fs.existsSync(row.placeholderPath)).toBe(false);
  });
});
