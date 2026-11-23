// The one network boundary: Civitai's block collection routes, read with the
// block token the host mints for this app.
//
//   GET /api/v1/blocks/collections?mode=mine   the viewer's own collections
//   GET /api/v1/blocks/collections/{id}        one page of a collection's items
//
// Both need the `collections:read:self` scope. What they return, from Civitai's
// source (src/pages/api/v1/blocks/collections, Nov 2026):
//
// - `mode=mine` lists collections the viewer owns. Followed collections are not
//   listed; a public one still opens by id.
// - A collection page holds ACCEPTED image and video items only, newest added
//   first (a contest collection is served in a shuffled order instead). Items
//   carry no added date. Items above the viewer's browsing level are left out.
// - A private collection answers 404 unless the token also carries the
//   consent-gated `collections:read:private`, which this app does not ask for.

export interface UserRef {
  userId: number;
  username: string | null;
}

export interface CollectionSummary {
  id: number;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  itemCount: number;
  curator: UserRef;
  isPublic: boolean;
  followed: boolean;
}

export interface CollectionDetail {
  id: number;
  name: string;
  description: string | null;
  curator: UserRef;
  isPublic: boolean;
  followed: boolean;
}

export interface MediaItem {
  mediaId: number;
  type: 'image' | 'video';
  url: string | null;
  width: number | null;
  height: number | null;
  creator: UserRef | null;
  nsfwLevel: number;
}

export interface CollectionPage {
  collection: CollectionDetail;
  items: MediaItem[];
  nextCursor?: string | number | null;
}

export interface CollectionList {
  items: CollectionSummary[];
  nextCursor?: string | number | null;
}

export interface ApiClient {
  listMine(cursor?: string): Promise<CollectionList>;
  getPage(id: number, cursor?: string, signal?: AbortSignal): Promise<CollectionPage>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export const PAGE_SIZE = 100;
// 10,000 items. A larger collection is reported as truncated rather than read forever.
export const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 20000;

interface HttpOptions {
  origin: string;
  getToken: () => string | undefined;
  refreshToken: () => Promise<unknown>;
}

export function createHttpClient({ origin, getToken, refreshToken }: HttpOptions): ApiClient {
  async function request<T>(path: string, query: Record<string, string | number | undefined>,
    signal?: AbortSignal, retried = false): Promise<T> {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const token = getToken();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, timeout.aborted ? 'Civitai took too long to answer.' : 'Could not reach Civitai.');
    }
    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError(response.status, 'Civitai sent an unexpected answer.');
      }
    }
    // The block token is short-lived; a 401 usually means it just expired.
    if (response.status === 401 && !retried) {
      await refreshToken().catch(() => {});
      return request<T>(path, query, signal, true);
    }
    throw await toError(response);
  }

  return {
    listMine: cursor => request<CollectionList>('/api/v1/blocks/collections',
      { mode: 'mine', limit: 100, cursor }),
    getPage: (id, cursor, signal) => request<CollectionPage>(`/api/v1/blocks/collections/${id}`,
      { limit: PAGE_SIZE, cursor }, signal),
  };
}

async function toError(response: Response): Promise<ApiError> {
  let message = '';
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const value = body.error ?? body.message;
    message = typeof value === 'string' ? value : '';
  } catch {
    // Classified on status alone.
  }
  switch (response.status) {
    case 401:
      return new ApiError(401, 'Your Civitai session expired. Reload the page to sign in again.');
    case 403:
      return new ApiError(403, message || 'Civitai refused this app access to collections.');
    case 404:
      return new ApiError(404, 'That collection does not exist, or it is private. This app reads public collections and your own public ones.');
    case 429: {
      const seconds = Number(response.headers.get('Retry-After'));
      return new ApiError(429, 'Civitai asked the app to slow down.',
        Number.isFinite(seconds) ? seconds * 1000 : undefined);
    }
    default:
      return new ApiError(response.status, message || `Civitai answered with an error (${response.status}).`);
  }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/** Every one of the viewer's own collections, sorted by name. */
export async function readMyCollections(api: ApiClient): Promise<CollectionSummary[]> {
  const found = new Map<number, CollectionSummary>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await api.listMine(cursor);
    for (const item of result.items ?? []) found.set(item.id, item);
    if (result.nextCursor == null || String(result.nextCursor) === cursor) break;
    cursor = String(result.nextCursor);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface CollectionRead {
  collection: CollectionDetail;
  items: MediaItem[];
  truncated: boolean;
  fetchedAt: Date;
}

/**
 * The whole collection, newest added first. A missing or repeated cursor ends the
 * read; the page cap bounds the rest. Rate limits are waited out a few times.
 */
export async function readCollection(api: ApiClient, id: number,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (count: number) => void } = {}): Promise<CollectionRead> {
  const items = new Map<number, MediaItem>();
  const seen = new Set<string>();
  let collection: CollectionDetail | null = null;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    let result: CollectionPage | null = null;
    for (let attempt = 0; !result; attempt++) {
      try {
        result = await api.getPage(id, cursor, signal);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429 || attempt >= 3) throw error;
        await sleep(error.retryAfterMs ?? 2000 * (attempt + 1), signal);
      }
    }
    collection ??= result.collection;
    for (const item of result.items ?? []) if (!items.has(item.mediaId)) items.set(item.mediaId, item);
    onProgress?.(items.size);
    const next = result.nextCursor == null ? null : String(result.nextCursor);
    if (next === null || seen.has(next)) {
      return { collection, items: [...items.values()], truncated: false, fetchedAt: new Date() };
    }
    seen.add(next);
    cursor = next;
  }
  return { collection: collection!, items: [...items.values()], truncated: true, fetchedAt: new Date() };
}

/** A collection id from a number or a civitai.com collection link. */
export function parseCollectionRef(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+)$/) ?? trimmed.match(/\/collections\/(\d+)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
