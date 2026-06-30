import { getMediaServerType } from '../settings';
import { plexBackend } from './plex';
import { jellyfinBackend } from './jellyfin';
import type { MediaBackend } from './types';

/** The read backend for the configured media server. Jellyfin and Emby share
 *  one implementation (same MediaBrowser API). */
export function getBackend(): MediaBackend {
  return getMediaServerType() === 'plex' ? plexBackend : jellyfinBackend;
}

export type { MediaBackend, BackendItem, BackendSection } from './types';
