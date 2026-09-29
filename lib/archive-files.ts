import fs from 'node:fs';
import path from 'node:path';
import type { SonarrEpisode, SonarrEpisodeFile, SonarrSeries } from './arr';
import type { ArchivePlaceholderConfig } from './settings';

export interface PlaceholderPlan {
  originalFileId: number;
  originalPath: string | null;
  originalRelativePath: string | null;
  episodeIds: number[];
  relativePath: string;
  targetPath: string;
  plexPath: string | null;
  stagingPath: string;
}

const WINDOWS_RESERVED = /[<>:"/\\|?*\u0000-\u001f]/g;

export function safePathSegment(value: string): string {
  const cleaned = value.replace(WINDOWS_RESERVED, ' ').replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || 'Unknown').slice(0, 120);
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' &&
    !path.isAbsolute(relative);
}

export function resolveArchivePath(root: string, relativePath: string): string {
  if (!path.isAbsolute(root)) throw new Error('Archive root must be an absolute path');
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Invalid archive relative path');
  const normalized = path.normalize(relativePath);
  if (normalized.split(path.sep).includes('..')) throw new Error('Archive path traversal rejected');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  if (!contained(resolvedRoot, target)) throw new Error('Archive path escapes configured root');
  return target;
}

export function validatePlaceholderConfig(config: ArchivePlaceholderConfig): void {
  if (!config.enabled) return;
  if (!path.isAbsolute(config.archiveRoot)) throw new Error('Archive root must be absolute');
  if (!config.templatePath || !path.isAbsolute(config.templatePath)) {
    throw new Error('Placeholder template path must be absolute');
  }
  const template = fs.statSync(config.templatePath);
  if (!template.isFile() || template.size === 0) {
    throw new Error('Placeholder template must be a non-empty file');
  }
  fs.mkdirSync(config.archiveRoot, { recursive: true });
  if (fs.lstatSync(config.archiveRoot).isSymbolicLink()) {
    throw new Error('Archive root must not be a symlink');
  }
  fs.accessSync(config.archiveRoot, fs.constants.R_OK | fs.constants.W_OK);
}

function assertNoSymlink(root: string, targetDirectory: string): void {
  const resolvedRoot = path.resolve(root);
  let cursor = resolvedRoot;
  const relative = path.relative(resolvedRoot, targetDirectory);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) fs.mkdirSync(cursor);
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Archive symlink rejected: ${cursor}`);
    }
  }
}

function episodeToken(episodes: SonarrEpisode[]): string {
  const sorted = [...episodes].sort((a, b) =>
    (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
    (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
  const first = sorted[0];
  const season = String(first.seasonNumber ?? 0).padStart(2, '0');
  const numbers = sorted.map((episode) => `E${String(episode.episodeNumber ?? 0).padStart(2, '0')}`);
  return `S${season}${numbers.join('-')}`;
}

export function buildPlaceholderPlans(input: {
  config: ArchivePlaceholderConfig;
  runId: string;
  series: SonarrSeries;
  files: SonarrEpisodeFile[];
  episodes: SonarrEpisode[];
}): PlaceholderPlan[] {
  const { config, runId, series, files, episodes } = input;
  validatePlaceholderConfig(config);
  const extension = path.extname(config.templatePath) || '.mkv';
  const seriesFolder = safePathSegment(series.title);
  return files.map((file) => {
    const mapped = episodes.filter((episode) => episode.episodeFileId === file.id);
    if (mapped.length === 0) throw new Error(`Episode file ${file.id} has no episodes`);
    if (mapped.some((episode) => episode.seasonNumber == null || episode.episodeNumber == null)) {
      throw new Error(`Episode file ${file.id} lacks season/episode numbers`);
    }
    const seasonNumber = mapped[0].seasonNumber!;
    if (mapped.some((episode) => episode.seasonNumber !== seasonNumber)) {
      throw new Error(`Episode file ${file.id} spans multiple seasons`);
    }
    const seasonFolder = `Season ${String(seasonNumber).padStart(2, '0')}`;
    const filename = `${seriesFolder} - ${episodeToken(mapped)} - Archived${extension}`;
    const relativePath = path.join(seriesFolder, seasonFolder, filename);
    const targetPath = resolveArchivePath(config.archiveRoot, relativePath);
    const plexPath = config.plexArchiveRoot
      ? path.posix.join(config.plexArchiveRoot.replace(/\\/g, '/'),
          relativePath.split(path.sep).join('/'))
      : null;
    return {
      originalFileId: file.id,
      originalPath: file.path ?? null,
      originalRelativePath: file.relativePath ?? null,
      episodeIds: mapped.map((episode) => episode.id).sort((a, b) => a - b),
      relativePath,
      targetPath,
      plexPath,
      stagingPath: resolveArchivePath(config.archiveRoot,
        path.join('.staging', runId, `${file.id}${extension}`)),
    };
  });
}

export function stagePlaceholders(
  config: ArchivePlaceholderConfig,
  plans: PlaceholderPlan[]
): void {
  for (const plan of plans) {
    if (fs.existsSync(plan.targetPath)) {
      throw new Error(`Archive target already exists: ${plan.relativePath}`);
    }
    assertNoSymlink(config.archiveRoot, path.dirname(plan.stagingPath));
    fs.copyFileSync(config.templatePath, plan.stagingPath, fs.constants.COPYFILE_EXCL);
  }
}

export function publishPlaceholders(
  config: ArchivePlaceholderConfig,
  plans: PlaceholderPlan[]
): void {
  for (const plan of plans) {
    assertNoSymlink(config.archiveRoot, path.dirname(plan.targetPath));
    if (fs.existsSync(plan.targetPath)) {
      throw new Error(`Archive target already exists: ${plan.relativePath}`);
    }
  }
  for (const plan of plans) {
    fs.renameSync(plan.stagingPath, plan.targetPath);
  }
  cleanupStaging(config.archiveRoot, plans[0]?.stagingPath);
}

export function cleanupStaging(root: string, stagingPath?: string): void {
  if (!stagingPath) return;
  const stagingRoot = resolveArchivePath(root, '.staging');
  const runDirectory = path.dirname(stagingPath);
  if (contained(stagingRoot, runDirectory) || runDirectory === stagingRoot) {
    fs.rmSync(runDirectory, { recursive: true, force: true });
  }
}

export function removeManagedPlaceholder(root: string, placeholderPath: string): boolean {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(placeholderPath);
  if (!contained(resolvedRoot, target)) throw new Error('Placeholder removal escaped archive root');
  if (!fs.existsSync(resolvedRoot) || fs.lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error('Archive root is missing or is a symlink');
  }
  if (!fs.existsSync(target)) return false;
  let parent = path.dirname(target);
  while (parent !== resolvedRoot) {
    if (!contained(resolvedRoot, parent) || fs.lstatSync(parent).isSymbolicLink()) {
      throw new Error('Refusing to traverse an archive symlink');
    }
    parent = path.dirname(parent);
  }
  const targetStat = fs.lstatSync(target);
  if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
    throw new Error('Refusing to remove a non-file archive entry');
  }
  fs.unlinkSync(target);
  let directory = path.dirname(target);
  while (directory !== resolvedRoot && contained(resolvedRoot, directory)) {
    if (fs.readdirSync(directory).length > 0) break;
    fs.rmdirSync(directory);
    directory = path.dirname(directory);
  }
  return true;
}