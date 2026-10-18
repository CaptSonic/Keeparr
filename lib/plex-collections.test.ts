import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMovieCollections } from './plex';
import type { CollectionReadDiagnostics } from './collection-diagnostics';

const diagnostics = (): CollectionReadDiagnostics => ({
  requests: 0, listingRequests: 0, metadataRequests: 0, memberRequests: 0,
  collections: 0, ignoredCollections: 0, members: 0, slowest: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('live Plex collection membership', () => {
  it('bounds collection reads at four and refills slots while a collection is slow', async () => {
    let finishSlow!: () => void;
    let active = 0;
    let peak = 0;
    const started: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/collections')) return new Response(JSON.stringify({ MediaContainer: {
        Metadata: Array.from({ length: 7 }, (_, index) => ({ ratingKey: String(index), Label: [] })),
      } }), { headers: { 'Content-Type': 'application/json' } });
      started.push(path);
      peak = Math.max(peak, ++active);
      if (path === '/library/metadata/0/children') {
        await new Promise<void>((resolve) => { finishSlow = resolve; });
      }
      active--;
      return new Response(JSON.stringify({ MediaContainer: { Metadata: [{ ratingKey: path.split('/')[3] }] } }),
        { headers: { 'Content-Type': 'application/json' } });
    }));
    const pending = getMovieCollections('http://plex', 'secret', 'movies');
    await vi.waitFor(() => expect(started).toHaveLength(7));
    expect(peak).toBeLessThanOrEqual(4);
    finishSlow();
    await expect(pending).resolves.toEqual(Array.from({ length: 7 }, (_, index) => [String(index)]));
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
      expect.objectContaining({ ratingKey: 'smart', requests: 2, members: 201, ignored: false }),
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