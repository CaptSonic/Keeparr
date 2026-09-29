import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import {
  claimArchiveRestoreByEpisodes,
  listArchiveEpisodes,
  replacePreparedArchiveEpisodes,
  setArchiveEpisodesStatus,
} from './queries';

beforeEach(() => __setTestDbToMemory());
afterAll(() => __closeDb());

function insertGroup() {
  const common = {
    instanceId: 's1', ratingKey: 'show', sectionId: '1', seriesId: 7,
    seriesTitle: 'Show', originalFileId: 11, originalPath: '/tv/file.mkv',
    originalRelativePath: 'Season 1/file.mkv', placeholderPath: '/archive/file.mkv',
    placeholderRelPath: 'Show/Season 01/file.mkv', plexPlaceholderPath: '/plex/file.mkv',
  };
  replacePreparedArchiveEpisodes([
    { ...common, episodeId: 101, seasonNumber: 1, episodeNumber: 1, episodeTitle: 'One' },
    { ...common, episodeId: 102, seasonNumber: 1, episodeNumber: 2, episodeTitle: 'Two' },
  ]);
  setArchiveEpisodesStatus('s1', [101, 102], 'archived');
}

describe('archive episode manifest', () => {
  it('claims an entire multi-episode file group exactly once', () => {
    insertGroup();
    expect(claimArchiveRestoreByEpisodes('s1', [101]).map((row) => row.episodeId)).toEqual([101, 102]);
    expect(claimArchiveRestoreByEpisodes('s1', [102])).toEqual([]);
    expect(listArchiveEpisodes().map((row) => row.status)).toEqual(['restoring', 'restoring']);
  });

  it('persists failures for audit and permits a prepared retry', () => {
    insertGroup();
    setArchiveEpisodesStatus('s1', [101, 102], 'failed', 'disk full');
    expect(listArchiveEpisodes()[0]).toMatchObject({ status: 'failed', lastError: 'disk full' });
  });
});