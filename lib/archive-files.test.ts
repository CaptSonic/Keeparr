import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPlaceholderPlans,
  publishPlaceholders,
  removeManagedPlaceholder,
  resolveArchivePath,
  stagePlaceholders,
  type PlaceholderPlan,
} from './archive-files';

let temp: string;
let root: string;
let template: string;

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeparr-archive-'));
  root = path.join(temp, 'archive');
  template = path.join(temp, 'placeholder.mkv');
  fs.mkdirSync(root);
  fs.writeFileSync(template, 'playable-placeholder');
});

afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

const config = () => ({
  enabled: true,
  archiveRoot: root,
  plexArchiveRoot: '/plex/archive',
  templatePath: template,
  automaticRestore: true,
  plexRefresh: false,
  webhookSecret: 'secret',
});

describe('archive placeholder files', () => {
  it('rejects traversal and absolute relative paths', () => {
    expect(() => resolveArchivePath(root, '../outside.mkv')).toThrow(/traversal|escapes/);
    expect(() => resolveArchivePath(root, path.resolve(temp, 'outside.mkv'))).toThrow(/relative/);
  });

  it('creates one placeholder for a multi-episode physical file', () => {
    const plans = buildPlaceholderPlans({
      config: config(),
      runId: 'run-1',
      series: { id: 7, title: 'A: Show' },
      files: [{ id: 11, path: '/tv/A Show/file.mkv', relativePath: 'Season 1/file.mkv' }],
      episodes: [
        { id: 101, episodeFileId: 11, seasonNumber: 1, episodeNumber: 1 },
        { id: 102, episodeFileId: 11, seasonNumber: 1, episodeNumber: 2 },
      ],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].episodeIds).toEqual([101, 102]);
    expect(plans[0].relativePath).toContain('S01E01-E02');
    expect(plans[0].plexPath).toContain('/plex/archive/A Show/Season 01/');
  });

  it('stages then atomically publishes and refuses foreign collisions', () => {
    const [plan] = buildPlaceholderPlans({
      config: config(), runId: 'run-2', series: { id: 7, title: 'Show' },
      files: [{ id: 11 }],
      episodes: [{ id: 101, episodeFileId: 11, seasonNumber: 1, episodeNumber: 1 }],
    });
    stagePlaceholders(config(), [plan]);
    expect(fs.readFileSync(plan.stagingPath, 'utf8')).toBe('playable-placeholder');
    publishPlaceholders(config(), [plan]);
    expect(fs.readFileSync(plan.targetPath, 'utf8')).toBe('playable-placeholder');

    const collision: PlaceholderPlan = { ...plan, stagingPath: `${plan.stagingPath}.again` };
    fs.mkdirSync(path.dirname(collision.stagingPath), { recursive: true });
    fs.copyFileSync(template, collision.stagingPath);
    expect(() => publishPlaceholders(config(), [collision])).toThrow(/already exists/);
  });

  it('only removes regular files contained below the configured root', () => {
    const target = resolveArchivePath(root, path.join('Show', 'Season 01', 'file.mkv'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'placeholder');
    expect(removeManagedPlaceholder(root, target)).toBe(true);
    expect(removeManagedPlaceholder(root, target)).toBe(false);
    expect(() => removeManagedPlaceholder(root, path.join(temp, 'outside.mkv'))).toThrow(/escaped/);
  });
});