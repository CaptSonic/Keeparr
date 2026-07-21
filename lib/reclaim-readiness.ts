import { getJobState } from './queries';
import {
  getWatchSourceFingerprint,
  isArrConfigured,
  isWatchAvailable,
  readSetting,
} from './settings';

/** Scoring sources are active only when their cached data is trustworthy. */
export function getReclaimSignalReadiness(): { watch: boolean; arr: boolean } {
  const fingerprint = getWatchSourceFingerprint();
  return {
    watch:
      isWatchAvailable() &&
      getJobState('watch').lastStatus === 'ok' &&
      fingerprint !== null &&
      readSetting('watch_source_fingerprint') === fingerprint,
    arr: isArrConfigured(),
  };
}