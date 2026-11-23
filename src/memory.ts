// What the app remembers for a viewer between visits: the collection they had
// open, their edited stats snippets and the public collections they opened by
// link. It lives in private collections of Civitai's document store (see block.manifest.json),
// which only that viewer can read.
//
// Remembering is a convenience, never a requirement. Every read and write is
// mirrored in memory for the visit, and a store that refuses (not approved yet,
// a dev-tunnel preview, offline, over quota) only means the next visit starts
// fresh, as it did before the app remembered anything.
import type { DocumentStorage } from '@civitai/sdk';

import type { Heading, SnippetSettings } from './analysis.js';

/** A collection opened by link, enough to list it and open it again. */
export interface RecentCollection {
  id: number;
  name: string;
  curator: string | null;
}

export interface Memory {
  /** The viewer's saved snippet for a collection, or `null` for the defaults. */
  snippet(id: number): Promise<SnippetSettings | null>;
  /** Save a snippet; `null` forgets it, back to the defaults. */
  saveSnippet(id: number, settings: SnippetSettings | null): Promise<void>;
  /** Collections opened by link, most recent first. */
  recent(): Promise<RecentCollection[]>;
  /** Put a collection at the front of the recent list. */
  remember(entry: RecentCollection): Promise<void>;
  forget(id: number): Promise<void>;
  /** The collection open when the viewer last left, or `null`. */
  lastOpened(): Promise<number | null>;
  setLastOpened(id: number): Promise<void>;
}

/** How many collections opened by link are kept. */
export const RECENT_LIMIT = 8;

const HEADINGS: readonly Heading[] = ['h2', 'h3', 'p'];
const key = (id: number) => `c-${id}`;

function asSnippet(data: unknown): SnippetSettings | null {
  const value = data as Partial<SnippetSettings> | null;
  if (!value || typeof value.title !== 'string' || typeof value.lines !== 'string') return null;
  if (!HEADINGS.includes(value.heading as Heading)) return null;
  return { title: value.title, lines: value.lines, heading: value.heading as Heading };
}

function asRecent(data: unknown): RecentCollection | null {
  const value = data as Partial<RecentCollection> | null;
  if (!value || !Number.isSafeInteger(value.id) || typeof value.name !== 'string') return null;
  return { id: value.id!, name: value.name, curator: typeof value.curator === 'string' ? value.curator : null };
}

function warn(what: string, error: unknown) {
  // eslint-disable-next-line no-console -- the viewer loses nothing but persistence
  console.warn(`Collectalytics: could not ${what}; it is kept for this visit only.`, error);
}

/**
 * Memory over the document store, or for the visit only when `storage` is (or
 * resolves to) `null`. Reads fall back to what this visit already knows; writes
 * land in memory first, so a refused write never loses the viewer's edit on
 * screen.
 */
export function createMemory(storage: DocumentStorage | Promise<DocumentStorage | null> | null): Memory {
  const snippets = new Map<number, SnippetSettings | null>();
  // What this visit opened or forgot, ahead of (and over) what the store had.
  let recent: RecentCollection[] = [];
  const forgotten = new Set<number>();
  let recentLoad: Promise<void> | null = null;
  const stores = Promise.resolve(storage).catch(error => {
    warn('reach the document store', error);
    return null;
  }).then(client => client && {
    snippets: client.collection<SnippetSettings>('snippets'),
    recent: client.collection<RecentCollection>('recent_collections'),
    prefs: client.collection<{ id: number }>('prefs'),
  });
  const snippetStore = () => stores.then(found => found?.snippets ?? null);
  const recentStore = () => stores.then(found => found?.recent ?? null);
  const prefsStore = () => stores.then(found => found?.prefs ?? null);
  let last: number | null | undefined;
  let lastWrite = Promise.resolve();

  async function loadRecent(): Promise<RecentCollection[]> {
    const store = await recentStore();
    if (!store) return [];
    try {
      const page = await store.list({ sort: '-updatedAt', limit: RECENT_LIMIT * 2 });
      const entries = page.items.map(doc => asRecent(doc.data)).filter(entry => entry !== null);
      // Anything past the limit was pushed out by newer opens; let it go.
      for (const doc of page.items.slice(RECENT_LIMIT)) store.delete(doc.key).catch(() => {});
      return entries.slice(0, RECENT_LIMIT);
    } catch (error) {
      warn('read the recently opened collections', error);
      return [];
    }
  }

  async function ensureRecent(): Promise<RecentCollection[]> {
    recentLoad ??= loadRecent().then(loaded => {
      // Opens during the load are newer than anything the store had.
      recent = mergeRecent(recent, loaded.filter(entry => !forgotten.has(entry.id)));
    });
    await recentLoad;
    return recent;
  }

  return {
    async snippet(id) {
      if (snippets.has(id)) return snippets.get(id)!;
      const store = await snippetStore();
      if (!store) return snippets.get(id) ?? null;
      try {
        const settings = asSnippet((await store.get(key(id)))?.data);
        // An edit made while this read was in flight wins over the stored one.
        if (!snippets.has(id)) snippets.set(id, settings);
        return snippets.get(id)!;
      } catch (error) {
        warn('read the saved snippet', error);
        return null;
      }
    },

    async saveSnippet(id, settings) {
      snippets.set(id, settings);
      const store = await snippetStore();
      if (!store) return;
      try {
        if (settings) await store.put(key(id), settings);
        else await store.delete(key(id));
      } catch (error) {
        warn('save the snippet', error);
      }
    },

    async recent() {
      return [...await ensureRecent()];
    },

    async remember(entry) {
      forgotten.delete(entry.id);
      recent = mergeRecent([entry], recent);
      const store = await recentStore();
      if (!store) return;
      try {
        await store.put(key(entry.id), entry);
      } catch (error) {
        warn('remember the collection', error);
      }
    },

    async forget(id) {
      forgotten.add(id);
      recent = recent.filter(entry => entry.id !== id);
      const store = await recentStore();
      if (!store) return;
      try {
        await store.delete(key(id));
      } catch (error) {
        warn('forget the collection', error);
      }
    },

    async lastOpened() {
      if (last !== undefined) return last;
      const store = await prefsStore();
      let stored: number | null = null;
      try {
        const id = (await store?.get('last'))?.data.id;
        stored = Number.isSafeInteger(id) && id! > 0 ? id! : null;
      } catch (error) {
        warn('read the last opened collection', error);
      }
      // A collection opened while this read was in flight is newer.
      if (last === undefined) last = stored;
      return last;
    },

    async setLastOpened(id) {
      if (last === id) return;
      last = id;
      // One write at a time, in order, so the last one wins.
      lastWrite = lastWrite.then(async () => {
        const store = await prefsStore();
        if (!store || last !== id) return;
        try {
          await store.put('last', { id });
        } catch (error) {
          warn('remember the open collection', error);
        }
      });
      await lastWrite;
    },
  };
}

/** `first` ahead of `rest`, one entry per collection, at most {@link RECENT_LIMIT}. */
function mergeRecent(first: RecentCollection[], rest: RecentCollection[]): RecentCollection[] {
  const seen = new Set<number>();
  return [...first, ...rest].filter(entry => !seen.has(entry.id) && seen.add(entry.id)).slice(0, RECENT_LIMIT);
}
