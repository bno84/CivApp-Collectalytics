import { describe, expect, it, vi } from 'vitest';
import { createFakeStorage } from '@civitai/sdk/testing';

import manifest from '../block.manifest.json';
import type { SnippetSettings } from './analysis.js';
import { RECENT_LIMIT, createMemory, type RecentCollection } from './memory.js';

const settings: SnippetSettings = { title: '[Neon cities]', lines: '{creators} creators', heading: 'h3' };
const entry = (id: number): RecentCollection => ({ id, name: `Collection ${id}`, curator: 'skyline_kat' });

/** Two visits by one viewer: two memories over the same store. */
function visits() {
  // A second between writes, so `updatedAt` orders them as a viewer's clicks would.
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const fake = createFakeStorage({ manifest, viewer: { username: 'alice' }, now: () => (clock += 1000) });
  return { fake, visit: () => createMemory(fake.storage) };
}

describe('createMemory', () => {
  it('brings a saved snippet back next visit, and forgets it on reset', async () => {
    const { visit } = visits();
    await visit().saveSnippet(201, settings);
    expect(await visit().snippet(201)).toEqual(settings);
    expect(await visit().snippet(202)).toBeNull();

    await visit().saveSnippet(201, null);
    expect(await visit().snippet(201)).toBeNull();
  });

  it('lists collections opened by link, newest first, one entry each, capped', async () => {
    const { visit } = visits();
    const first = visit();
    for (let id = 1; id <= RECENT_LIMIT + 2; id++) await first.remember(entry(id));
    await first.remember(entry(3));

    const ids = (await visit().recent()).map(item => item.id);
    expect(ids[0]).toBe(3);
    expect(ids).toHaveLength(RECENT_LIMIT);
    expect(new Set(ids).size).toBe(RECENT_LIMIT);
    expect(ids).not.toContain(1);
  });

  it('keeps a forgotten collection forgotten, even while the list is loading', async () => {
    const { visit } = visits();
    await visit().remember(entry(1));
    await visit().remember(entry(2));

    const second = visit();
    const loading = second.recent();
    await second.forget(1);
    expect((await loading).map(item => item.id)).toEqual([2]);
    expect((await visit().recent()).map(item => item.id)).toEqual([2]);
  });

  it('brings back the collection open last, the latest of several', async () => {
    const { visit } = visits();
    expect(await visit().lastOpened()).toBeNull();
    const first = visit();
    await Promise.all([first.setLastOpened(101), first.setLastOpened(201), first.setLastOpened(102)]);
    expect(await first.lastOpened()).toBe(102);
    expect(await visit().lastOpened()).toBe(102);
  });

  it('only keeps things for the visit when the store refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refusing = createFakeStorage({ manifest, appStatus: 'pending' });
    const memory = createMemory(refusing.storage);

    await memory.saveSnippet(201, settings);
    await memory.remember(entry(201));
    await memory.setLastOpened(201);
    expect(await memory.snippet(201)).toEqual(settings);
    expect(await memory.lastOpened()).toBe(201);
    expect(await memory.recent()).toEqual([entry(201)]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('works for the visit with no store at all', async () => {
    const memory = createMemory(Promise.reject(new Error('no host')).catch(() => null));
    await memory.saveSnippet(1, settings);
    expect(await memory.snippet(1)).toEqual(settings);
    expect(await memory.recent()).toEqual([]);
  });

  it('ignores a stored document that is not a snippet', async () => {
    const { fake, visit } = visits();
    await fake.storage.collection('snippets').put('c-5', { title: 1, heading: 'h9' });
    expect(await visit().snippet(5)).toBeNull();
  });
});
