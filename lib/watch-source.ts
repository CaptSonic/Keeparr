import { getMediaServerType, getPlexWatchSource, getWatchSourceFingerprint } from './settings';
import { activePlaybackTitles as tautulliActivePlaybackTitles } from './tautulli';
import { tracearrActivePlaybackTitles } from './tracearr';

/** One explicit provider for both history and live protection; never fall back. */
export async function activePlaybackTitles(): Promise<Set<string>> {
  if (getMediaServerType() !== 'plex') return new Set();
  const fingerprint = getWatchSourceFingerprint();
  const titles = await (getPlexWatchSource() === 'tracearr'
    ? tracearrActivePlaybackTitles()
    : tautulliActivePlaybackTitles());
  if (fingerprint !== getWatchSourceFingerprint()) throw new Error('Watch source changed during live playback check.');
  return titles;
}