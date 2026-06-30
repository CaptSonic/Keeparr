import { getItems, getLibraries, getSeriesSize, getWatchHistory } from '../jellyfin';
import { getServerBaseUrl, getServerToken } from '../settings';
import type { MediaBackend } from './types';

function creds(): { baseUrl: string; token: string } {
  const baseUrl = getServerBaseUrl();
  const token = getServerToken();
  if (!baseUrl || !token) throw new Error('Jellyfin/Emby server not configured');
  return { baseUrl, token };
}

/** Jellyfin/Emby backend (same MediaBrowser API for both). */
export const jellyfinBackend: MediaBackend = {
  async listSections() {
    const { baseUrl, token } = creds();
    return getLibraries(baseUrl, token);
  },
  async listSectionItems(sectionId, kind) {
    const { baseUrl, token } = creds();
    return getItems(baseUrl, token, sectionId, kind);
  },
  async recentItems(sectionId, kind, limit) {
    const { baseUrl, token } = creds();
    return getItems(baseUrl, token, sectionId, kind, limit);
  },
  async showSize(ratingKey) {
    const { baseUrl, token } = creds();
    return getSeriesSize(baseUrl, token, ratingKey);
  },
  async getWatchData() {
    const { baseUrl, token } = creds();
    return getWatchHistory(baseUrl, token);
  },
};
