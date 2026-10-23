import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { __setTestDbToMemory, __closeDb } from './db';
import { maintainerrRuleTracking, reconcileMaintainerrRuleTracking, upsertMediaBatch } from './queries';
import {
  approveMaintainerrPlan,
  approveMaintainerrReadd,
  consumeMaintainerrPlanApproval,
  consumeMaintainerrReaddApproval,
  getMaintainerrApprovedPlanHash,
  getMaintainerrConfig,
  getArchivePlaceholderConfig,
  isMaintainerrReaddApproved,
  getMediaServerType,
  setMediaServerType,
  getServerBaseUrl,
  getServerToken,
  getServerName,
  getOwnerId,
  setMaintainerrConfig,
  isServerConfigured,
  writeSetting,
} from './settings';

beforeEach(() => {
  __setTestDbToMemory();
});
afterAll(() => {
  __closeDb();
});

describe('media server type + backend-aware settings', () => {
  it('uses the bundled Plex placeholder video by default', () => {
    expect(getArchivePlaceholderConfig().templatePath)
      .toBe('/placeholder/plex_platzhalter_comic.mp4');
    writeSetting('archive_placeholder_template', '   ');
    expect(getArchivePlaceholderConfig().templatePath)
      .toBe('/placeholder/plex_platzhalter_comic.mp4');
    writeSetting('archive_placeholder_template', '/placeholder/custom.mp4');
    expect(getArchivePlaceholderConfig().templatePath).toBe('/placeholder/custom.mp4');
  });

  it('defaults to plex when unset (backward compat for existing installs)', () => {
    expect(getMediaServerType()).toBe('plex');
  });

  it('an existing Plex install (plex_* keys set, no media_server_type) works unchanged', () => {
    writeSetting('plex_machine_id', 'abc');
    writeSetting('plex_base_url', 'http://plex:32400');
    writeSetting('plex_server_token', 'tok-plex');
    expect(getMediaServerType()).toBe('plex');
    expect(isServerConfigured()).toBe(true);
    expect(getServerBaseUrl()).toBe('http://plex:32400');
    expect(getServerToken()).toBe('tok-plex'); // decrypted round-trip
  });

  it('resolves generic accessors to the configured backend, isolated per type', () => {
    // Plex configured...
    writeSetting('plex_machine_id', 'abc');
    writeSetting('plex_base_url', 'http://plex:32400');
    writeSetting('plex_server_token', 'tok-plex');
    writeSetting('plex_owner_id', '111');

    // ...switch to Jellyfin: not configured until its own keys exist.
    setMediaServerType('jellyfin');
    expect(getMediaServerType()).toBe('jellyfin');
    expect(isServerConfigured()).toBe(false);
    expect(getServerToken()).toBeNull();

    writeSetting('jellyfin_url', 'http://jf:8096');
    writeSetting('jellyfin_token', 'tok-jf');
    writeSetting('jellyfin_server_name', 'My Jellyfin');
    writeSetting('jellyfin_owner_id', '222');
    expect(isServerConfigured()).toBe(true);
    expect(getServerBaseUrl()).toBe('http://jf:8096');
    expect(getServerToken()).toBe('tok-jf');
    expect(getServerName()).toBe('My Jellyfin');
    expect(getOwnerId()).toBe('222');

    // Flipping back to Plex reveals the untouched Plex config.
    setMediaServerType('plex');
    expect(isServerConfigured()).toBe(true);
    expect(getServerToken()).toBe('tok-plex');
    expect(getOwnerId()).toBe('111');
  });
});

describe('Maintainerr one-time safety approvals', () => {
  it('inherits the legacy observation period for both media kinds', () => {
    writeSetting('maintainerr_observation_days', '45');
    const rules = getMaintainerrConfig().automaticRules;
    expect(rules.movie).toEqual({
      requesterEnabled: true, requesterDays: 180, globalEnabled: true,
      globalDays: 540, observationDays: 45,
    });
    expect(rules.show).toEqual(rules.movie);
  });

  it('resets only changed media-kind clocks and clears pending approvals', () => {
    upsertMediaBatch((['movie', 'show'] as const).map((kind) => ({
      ratingKey: kind, sectionId: kind, libraryKind: kind, title: kind,
      year: null, thumb: null, sizeBytes: 1, addedAt: 1, guidTmdb: null, guidTvdb: null,
    })));
    reconcileMaintainerrRuleTracking([
      { ratingKey: 'movie', rule: 'global_unwatched_540d' },
      { ratingKey: 'show', rule: 'global_unwatched_540d' },
    ], 100);
    const config = getMaintainerrConfig();
    approveMaintainerrPlan('plan');
    approveMaintainerrReadd(10, 'movie');
    config.automaticRules.movie.globalDays = 365;
    setMaintainerrConfig(config);
    expect(maintainerrRuleTracking().map((row) => row.ratingKey)).toEqual(['show']);
    expect(getMaintainerrApprovedPlanHash()).toBeNull();
    expect(isMaintainerrReaddApproved(10, 'movie')).toBe(false);
    setMaintainerrConfig(config);
    expect(maintainerrRuleTracking().map((row) => row.ratingKey)).toEqual(['show']);
  });

  it('disables automatic rules if their stored configuration is corrupt', () => {
    writeSetting('maintainerr_automatic_rules', 'invalid json');
    const rules = getMaintainerrConfig().automaticRules;
    for (const kind of ['movie', 'show'] as const) {
      expect(rules[kind].requesterEnabled).toBe(false);
      expect(rules[kind].globalEnabled).toBe(false);
    }
  });
  it('consumes only the exact approved plan hash once', () => {
    approveMaintainerrPlan('plan-a');
    expect(getMaintainerrApprovedPlanHash()).toBe('plan-a');
    expect(consumeMaintainerrPlanApproval('plan-b')).toBe(false);
    expect(getMaintainerrApprovedPlanHash()).toBe('plan-a');
    expect(consumeMaintainerrPlanApproval('plan-a')).toBe(true);
    expect(consumeMaintainerrPlanApproval('plan-a')).toBe(false);
    expect(getMaintainerrApprovedPlanHash()).toBeNull();
  });

  it('keeps re-add approvals scoped and consumes them independently', () => {
    approveMaintainerrReadd(10, 'a');
    approveMaintainerrReadd(10, 'b');
    approveMaintainerrReadd(20, 'a');
    expect(isMaintainerrReaddApproved(10, 'a')).toBe(true);
    expect(isMaintainerrReaddApproved(20, 'a')).toBe(true);
    expect(consumeMaintainerrReaddApproval(10, 'a')).toBe(true);
    expect(isMaintainerrReaddApproved(10, 'a')).toBe(false);
    expect(isMaintainerrReaddApproved(10, 'b')).toBe(true);
    expect(isMaintainerrReaddApproved(20, 'a')).toBe(true);
  });

  it('clears all pending approvals when Maintainerr configuration changes', () => {
    approveMaintainerrPlan('plan-a');
    approveMaintainerrReadd(10, 'a');
    setMaintainerrConfig({
      url: 'http://maintainerr:6246', movieCollectionId: 10,
      showCollectionId: 20, watchAgeDays: 180, enabled: true,
      observationDays: 30,
    });
    expect(getMaintainerrApprovedPlanHash()).toBeNull();
    expect(isMaintainerrReaddApproved(10, 'a')).toBe(false);
  });

  it('migrates legacy collection selections and clears approvals when an extra library is selected', () => {
    writeSetting('maintainerr_movie_collection_id', '10');
    writeSetting('maintainerr_show_collection_id', '20');
    expect(getMaintainerrConfig()).toMatchObject({ movieCollectionIds: [10], showCollectionIds: [20] });
    approveMaintainerrPlan('old-plan');
    approveMaintainerrReadd(20, 'show');
    setMaintainerrConfig({ ...getMaintainerrConfig(), showCollectionIds: [20, 30] });
    expect(getMaintainerrConfig()).toMatchObject({ movieCollectionId: 10, showCollectionId: 20,
      movieCollectionIds: [10], showCollectionIds: [20, 30] });
    expect(getMaintainerrApprovedPlanHash()).toBeNull();
    expect(isMaintainerrReaddApproved(20, 'show')).toBe(false);
  });
});
