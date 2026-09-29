import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  finalizeRestoredSeries,
  requestArchiveRestoreByPlexPath,
  getArchivePlaceholderConfig,
  getMachineId,
  getSonarrInstances,
} = vi.hoisted(() => ({
  finalizeRestoredSeries: vi.fn(),
  requestArchiveRestoreByPlexPath: vi.fn(),
  getArchivePlaceholderConfig: vi.fn(),
  getMachineId: vi.fn(),
  getSonarrInstances: vi.fn(),
}));

vi.mock('@/lib/archive-restore', () => ({
  finalizeRestoredSeries,
  requestArchiveRestoreByPlexPath,
}));
vi.mock('@/lib/settings', () => ({
  getArchivePlaceholderConfig,
  getMachineId,
  getSonarrInstances,
}));

import { POST as plexWebhook } from '@/app/api/webhooks/plex/route';
import { POST as sonarrWebhook } from '@/app/api/webhooks/sonarr/route';

function plexRequest(payload: unknown, token = 'secret'): Request {
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  return new Request(`http://localhost/api/webhooks/plex?token=${token}`, {
    method: 'POST',
    body: form,
  });
}

function sonarrRequest(payload: unknown, options: { token?: string; instance?: string } = {}): Request {
  const token = options.token ?? 'secret';
  const instance = options.instance ?? 'sonarr-1';
  return new Request(
    `http://localhost/api/webhooks/sonarr?instance=${instance}&token=${token}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getArchivePlaceholderConfig.mockReturnValue({
    enabled: true,
    archiveRoot: '/archive',
    plexArchiveRoot: '/plex/archive',
    templatePath: '/placeholder/archived.mkv',
    automaticRestore: true,
    plexRefresh: true,
    webhookSecret: 'secret',
  });
  getMachineId.mockReturnValue('plex-server');
  getSonarrInstances.mockReturnValue([
    { id: 'sonarr-1', name: 'Sonarr', url: 'http://sonarr', apiKey: 'key' },
  ]);
  requestArchiveRestoreByPlexPath.mockResolvedValue({
    ok: true,
    requested: 1,
    matched: true,
  });
  finalizeRestoredSeries.mockResolvedValue({ restored: 2, removedPlaceholders: 1 });
});

describe('archive webhooks', () => {
  it('rejects an invalid secret before processing Plex or Sonarr payloads', async () => {
    expect((await plexWebhook(plexRequest({}, 'wrong'))).status).toBe(401);
    expect((await sonarrWebhook(sonarrRequest({}, { token: 'wrong' }))).status).toBe(401);
    expect(requestArchiveRestoreByPlexPath).not.toHaveBeenCalled();
    expect(finalizeRestoredSeries).not.toHaveBeenCalled();
  });

  it('ignores Plex playback from another configured server identity', async () => {
    const response = await plexWebhook(plexRequest({
      event: 'media.play',
      Server: { uuid: 'other-server' },
      Metadata: {
        type: 'episode',
        Media: [{ Part: [{ file: '/plex/archive/Show/episode.mkv' }] }],
      },
    }));
    expect(await response.json()).toEqual({ ignored: 'server_mismatch' });
    expect(requestArchiveRestoreByPlexPath).not.toHaveBeenCalled();
  });

  it('does not query the manifest for a Plex path outside the configured archive root', async () => {
    const response = await plexWebhook(plexRequest({
      event: 'media.play',
      Server: { uuid: 'plex-server' },
      Metadata: {
        type: 'episode',
        Media: [{ Part: [{ file: '/tv/Show/episode.mkv' }] }],
      },
    }));
    expect(await response.json()).toEqual({ matched: false, requested: 0 });
    expect(requestArchiveRestoreByPlexPath).not.toHaveBeenCalled();
  });

  it('accepts a Sonarr test event without finalizing a restore', async () => {
    const response = await sonarrWebhook(sonarrRequest({ eventType: 'Test' }));
    expect(await response.json()).toEqual({ ok: true, test: true });
    expect(finalizeRestoredSeries).not.toHaveBeenCalled();
  });

  it('finalizes a Sonarr import for the authenticated instance and series', async () => {
    const response = await sonarrWebhook(sonarrRequest({
      eventType: 'Download',
      series: { id: 42 },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restored: 2, removedPlaceholders: 1 });
    expect(finalizeRestoredSeries).toHaveBeenCalledWith('sonarr-1', 42);
  });

  it('rejects a declared oversized webhook body before parsing it', async () => {
    const request = new Request(
      'http://localhost/api/webhooks/sonarr?instance=sonarr-1&token=secret',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '1048577' },
        body: '{}',
      }
    );
    expect((await sonarrWebhook(request)).status).toBe(413);
    expect(finalizeRestoredSeries).not.toHaveBeenCalled();
  });
});