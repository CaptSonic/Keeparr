import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMovieCollections } from './plex';

afterEach(() => vi.unstubAllGlobals());

describe('live Plex collection membership', () => {
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
          ratingKey, ...(listing ? { key: `/library/collections/${ratingKey}/children` } : {}),
        })),
      } }), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getMovieCollections('http://plex', 'secret', 'movies');
    expect(result[0]).toHaveLength(201);
    expect(result[0][200]).toBe('200');
    expect(result[1]).toEqual(['other']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
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