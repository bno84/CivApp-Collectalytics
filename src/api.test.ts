// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpClient, parseRetryAfter, readCollection, type ApiClient, type CollectionPage } from './api.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('createHttpClient', () => {
  it('retries a 401 with the token the refresh returned', async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization');
      seen.push(auth);
      return auth === 'Bearer fresh' ? json({ items: [] }) : json({ error: 'expired' }, 401);
    }));
    const api = createHttpClient({ origin: 'https://civitai.com', getToken: () => 'stale', refreshToken: async () => ({ raw: 'fresh' }) });
    await expect(api.listMine()).resolves.toEqual({ items: [] });
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('waits out a 429 and then answers', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++calls === 1 ? json({}, 429, { 'Retry-After': '0' }) : json({ items: [] }))));
    const api = createHttpClient({ origin: 'https://civitai.com', getToken: () => 't', refreshToken: async () => undefined });
    await expect(api.listMine()).resolves.toEqual({ items: [] });
    expect(calls).toBe(2);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and dates, and nothing from an absent header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000);
  });
});

describe('readCollection', () => {
  const page = (cursor?: string): CollectionPage => ({
    collection: { id: 1, name: 'c', description: null, curator: { userId: 1, username: 'u' }, isPublic: true, followed: false },
    items: [{ mediaId: Number(cursor ?? 0) + 1, type: 'image', url: null, width: 1, height: 1, creator: null, nsfwLevel: 1 }],
    nextCursor: cursor === '1' ? '1' : String(Number(cursor ?? 0) + 1),
  });

  it('reports a repeated cursor as incomplete', async () => {
    const api: ApiClient = { listMine: async () => ({ items: [] }), getPage: async (_id, cursor) => page(cursor) };
    const result = await readCollection(api, 1);
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(2);
  });
});
