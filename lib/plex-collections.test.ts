import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMovieCollections } from './plex';
import type { CollectionReadDiagnostics } from './collection-diagnostics';
import { getPlexCollectionConcurrency } from './config';

const diagnostics = (): CollectionReadDiagnostics => ({
  requests: 0, listingRequests: 0, metadataRequests: 0, memberRequests: 0,
  listingMs: 0, metadataMs: 0, memberMs: 0,
  collections: 0, ignoredCollections: 0, members: 0, slowest: [],
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('live Plex collection membership', () => {
  it('requests optional labels on every listing page and avoids redundant metadata reads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/collections')) {
        expect(url.searchParams.get('includeOptionalElements')).toBe('Label');
        const start = Number(url.searchParams.get('X-Plex-Container-Start'));
        const rows = Array.from({ length: 201 }, (_, index) => ({
          ratingKey: String(index), Label: index === 200 ? [] : [{ tag: 'aGrEgArR-generated' }],
        }));
        return Response.json({ MediaContainer: { totalSize: rows.length, Metadata: rows.slice(start, start + 200) } });
      }
      expect(url.pathname).toBe('/library/metadata/200/children');
      expect(url.searchParams.has('includeOptionalElements')).toBe(false);
      return Response.json({ MediaContainer: { Metadata: [{ ratingKey: 'protected' }] } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const stats = diagnostics();
    await expect(getMovieCollections('http://plex', 'secret', 'movies', stats)).resolves.toEqual([['protected']]);
    expect(stats).toMatchObject({ requests: 3, listingRequests: 2, metadataRequests: 0,
      memberRequests: 1, ignoredCollections: 200 });
    expect(stats.slowest).toHaveLength(5);
  });

  it('falls back when optional labels are omitted and measures request categories separately', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    let clock = 0;
    vi.mocked(performance.now).mockImplementation(() => clock);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/collections')) {
        clock += 10;
        return Response.json({ MediaContainer: { Metadata: [{ ratingKey: 'normal' }] } });
      }
      if (path === '/library/metadata/normal') {
        clock += 20;
        return Response.json({ MediaContainer: { Metadata: [{ ratingKey: 'normal', Label: [] }] } });
      }
      clock += 30;
      return Response.json({ MediaContainer: { Metadata: [{ ratingKey: 'protected' }] } });
    }));
    try {
      const stats = diagnostics();
      await expect(getMovieCollections('http://plex', 'secret', 'movies', stats)).resolves.toEqual([['protected']]);
      expect(stats).toMatchObject({ listingMs: 10, metadataMs: 20, memberMs: 30, requests: 3 });
      expect(stats.slowest[0]).toMatchObject({ durationMs: 50, metadataMs: 20, memberMs: 30 });
    } finally {
      vi.mocked(performance.now).mockRestore();
    }
  });

  it('rejects malformed inline labels instead of skipping collection protection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ MediaContainer: {
      Metadata: [{ ratingKey: 'normal', Label: [{ tag: null }] }],
    } })));
    await expect(getMovieCollections('http://plex', 'secret', 'movies')).rejects.toThrow('invalid collection labels');
  });

  it.each([4, 8])('bounds collection reads at %i and refills slots while a collection is slow', async (limit) => {
    vi.stubEnv('PLEX_COLLECTION_CONCURRENCY', String(limit));
    let finishSlow!: () => void;
    let releaseFast!: () => void;
    const fastGate = new Promise<void>((resolve) => { releaseFast = resolve; });
    let active = 0;
    let peak = 0;
    const started: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/collections')) return new Response(JSON.stringify({ MediaContainer: {
        Metadata: Array.from({ length: 17 }, (_, index) => ({ ratingKey: String(index), Label: [] })),
      } }), { headers: { 'Content-Type': 'application/json' } });
      started.push(path);
      peak = Math.max(peak, ++active);
      if (path === '/library/metadata/0/children') {
        await new Promise<void>((resolve) => { finishSlow = resolve; });
      } else {
        await fastGate;
      }
      active--;
      return new Response(JSON.stringify({ MediaContainer: { Metadata: [{ ratingKey: path.split('/')[3] }] } }),
        { headers: { 'Content-Type': 'application/json' } });
    }));
    const stats = diagnostics();
    const pending = getMovieCollections('http://plex', 'secret', 'movies', stats);
    await vi.waitFor(() => expect(started).toHaveLength(limit));
    expect(peak).toBe(limit);
    releaseFast();
    await vi.waitFor(() => expect(started).toHaveLength(17));
    expect(peak).toBe(limit);
    expect(stats).toMatchObject({ concurrency: limit, peakRequests: limit });
    finishSlow();
    await expect(pending).resolves.toEqual(Array.from({ length: 17 }, (_, index) => [String(index)]));
  });

  it.each([undefined, '', '0', '16', '4.5', 'invalid'])('defaults unsupported concurrency %s to eight', (value) => {
    vi.stubEnv('PLEX_COLLECTION_CONCURRENCY', value);
    expect(getPlexCollectionConcurrency()).toBe(8);
  });

  it.each([4, 8])('stops scheduling and drains active requests on failure at limit %i', async (limit) => {
    vi.stubEnv('PLEX_COLLECTION_CONCURRENCY', String(limit));
    const finish: Array<() => void> = [];
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/collections')) return Response.json({ MediaContainer: {
        Metadata: Array.from({ length: 20 }, (_, index) => ({ ratingKey: String(index), Label: [] })),
      } });
      paths.push(path);
      if (path === '/library/metadata/0/children') throw new Error('Plex offline');
      await new Promise<void>((resolve) => finish.push(resolve));
      return Response.json({ MediaContainer: { Metadata: [] } });
    }));
    let settled = false;
    const pending = getMovieCollections('http://plex', 'secret', 'movies').catch((error) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => expect(finish).toHaveLength(limit - 1));
    expect(paths).toHaveLength(limit);
    expect(settled).toBe(false);
    finish.forEach((resolve) => resolve());
    expect(await pending).toEqual(new Error('Plex offline'));
    expect(paths).toHaveLength(limit);
  });

  it('pages collections and their children, including smart collection results', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const start = Number(url.searchParams.get('X-Plex-Container-Start'));
      const listing = url.pathname.endsWith('/collections');
      const ids = listing ? ['smart', 'normal'] :
        url.pathname.includes('/smart/') ? Array.from({ length: 201 }, (_, i) => String(i)) : ['other'];
      return new Response(JSON.stringify({ MediaContainer: {
        totalSize: ids.length,
        [listing ? 'Directory' : 'Metadata']: ids.slice(start, start + 200).map((ratingKey) => ({
          ratingKey, ...(listing ? { key: `/library/collections/${ratingKey}/children`, Label: [] } : {}),
        })),
      } }), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const stats = diagnostics();
    const result = await getMovieCollections('http://plex', 'secret', 'movies', stats);
    expect(result[0]).toHaveLength(201);
    expect(result[0][200]).toBe('200');
    expect(result[1]).toEqual(['other']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(stats).toMatchObject({ requests: 4, listingRequests: 1, metadataRequests: 0,
      memberRequests: 3, collections: 2, ignoredCollections: 0, members: 202 });
    expect(stats.slowest).toEqual(expect.arrayContaining([
      expect.objectContaining({ ratingKey: 'smart', requests: 2, members: 201, ignored: false,
        memberPath: '/library/collections/smart/children' }),
    ]));
  });

  it('ignores Agregarr collections but preserves normal collections sharing their movies', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      const rows = path.endsWith('/collections') ? [
        { ratingKey: 'managed', Label: [{ tag: 'aGrEgArRtMdB123' }] },
        { ratingKey: 'smart' },
        { ratingKey: 'normal', title: 'Agregarr is only a title', Label: [{ tag: 'Favorites' }] },
      ] : path === '/library/metadata/smart' ? [
        { ratingKey: 'smart', smart: 1, Label: [{ tag: 'agregarr-unwatched-42' }] },
      ] : path === '/library/metadata/normal/children' ? [
        { ratingKey: 'shared-movie' }, { ratingKey: 'protected-movie' },
      ] : (() => { throw new Error(`Unexpected request: ${path}`); })();
      return new Response(JSON.stringify({ MediaContainer: { Metadata: rows } }),
        { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const stats = diagnostics();
    await expect(getMovieCollections('http://plex', 'secret', '1', stats))
      .resolves.toEqual([['shared-movie', 'protected-movie']]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stats).toMatchObject({ requests: 3, listingRequests: 1, metadataRequests: 1,
      memberRequests: 1, collections: 3, ignoredCollections: 2, members: 2 });
    expect(stats.slowest).toHaveLength(3);
  });

  it('keeps unlabeled collections after loading their metadata', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return new Response(JSON.stringify({ MediaContainer: { Metadata: [
        { ratingKey: path.endsWith('/children') ? 'movie' : 'normal' },
      ] } }), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMovieCollections('http://plex', 'secret', '1')).resolves.toEqual([['movie']]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects missing collection metadata rather than silently skipping protection', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify({
      MediaContainer: { Metadata: new URL(String(input)).pathname.endsWith('/collections')
        ? [{ ratingKey: 'normal' }] : [] },
    }), { headers: { 'Content-Type': 'application/json' } })));
    await expect(getMovieCollections('http://plex', 'secret', '1')).rejects.toThrow('invalid collection metadata');
  });

  it('rejects malformed collection responses rather than treating them as unprotected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      MediaContainer: { Metadata: [{ title: 'missing id' }] },
    }), { headers: { 'Content-Type': 'application/json' } })));
    await expect(getMovieCollections('http://plex', 'secret', '1')).rejects.toThrow('invalid collection member');
  });

  it('rejects truncated pagination', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      MediaContainer: { totalSize: 2, Metadata: [] },
    }), { headers: { 'Content-Type': 'application/json' } })));
    await expect(getMovieCollections('http://plex', 'secret', '1')).rejects.toThrow('incomplete collection inventory');
  });
});