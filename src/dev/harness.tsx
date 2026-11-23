// Development only: the SDK's mock host (BLOCK_INIT, a signed-in viewer, theme)
// and an in-memory stand-in for Civitai's collection routes, shaped like them.
import { getTransport } from '@civitai/blocks-react';
import { Harness } from '@civitai/blocks-react/testing';

import { App } from '../App.js';
import { ApiError, type ApiClient, type CollectionDetail, type MediaItem } from '../api.js';

// The mock host answers from this origin; the transport drops anything else.
getTransport({ allowedParentOrigins: [window.location.origin] });

const CREATORS = ['lunaforge', 'pixelmonk', 'neonherb', 'driftcat', 'oakandash', 'mirevale', 'quietcircuit',
  'saltglass', 'tidewright', 'emberloom', 'fernhollow', 'glintwick', 'hushmoth', 'irisvane', 'juniperbyte'];

/** A seeded generator, so the sample is the same on every reload. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function sampleItems(count: number, seed: number, videoShare: number): MediaItem[] {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    // A skewed pick, so a few creators dominate, plus newcomers further in.
    const pool = Math.min(CREATORS.length + 40, 6 + Math.floor((count - i) / 8));
    const pick = Math.floor(Math.pow(next(), 2.2) * pool);
    const username = CREATORS[pick] ?? `creator${pick}`;
    return {
      mediaId: seed * 100000 + i, type: next() < videoShare ? 'video' : 'image', url: null,
      width: 832, height: 1216, nsfwLevel: 1, creator: { userId: 5000 + pick, username },
    };
  });
}

// Owned by the dev viewer, so `mode=mine` lists them.
const OWNED: { detail: CollectionDetail; items: MediaItem[] }[] = [
  { detail: { id: 101, name: 'Music Focus 🎸', description: null, curator: { userId: 1, username: 'dev-viewer' }, isPublic: true, followed: false },
    items: sampleItems(640, 101, 1) },
  { detail: { id: 102, name: 'Cozy interiors', description: null, curator: { userId: 1, username: 'dev-viewer' }, isPublic: true, followed: false },
    items: sampleItems(180, 102, 0.1) },
  { detail: { id: 103, name: 'Empty for now', description: null, curator: { userId: 1, username: 'dev-viewer' }, isPublic: true, followed: false },
    items: [] },
];

// Someone else's, reachable only by link, as on Civitai: try 201 (followed) and 202.
const OTHERS: { detail: CollectionDetail; items: MediaItem[] }[] = [
  { detail: { id: 201, name: 'Neon cities', description: null, curator: { userId: 77, username: 'skyline_kat' }, isPublic: true, followed: true },
    items: sampleItems(420, 201, 0.2) },
  { detail: { id: 202, name: 'Retro mecha', description: null, curator: { userId: 78, username: 'boltwright' }, isPublic: true, followed: false },
    items: sampleItems(95, 202, 0) },
];
const COLLECTIONS = [...OWNED, ...OTHERS];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fakeApi: ApiClient = {
  async listMine() {
    await delay(200);
    return {
      items: OWNED.map(({ detail, items }) => ({
        ...detail, coverImageUrl: null, itemCount: items.length,
      })),
    };
  },
  async getPage(id, cursor) {
    await delay(120);
    const found = COLLECTIONS.find(entry => entry.detail.id === id);
    if (!found) throw new ApiError(404, 'That collection does not exist, or it is private.');
    const start = cursor ? Number(cursor) : 0;
    const end = start + 100;
    return {
      collection: found.detail,
      items: found.items.slice(start, end),
      nextCursor: end < found.items.length ? String(end) : undefined,
    };
  },
};

export function HarnessApp() {
  return (
    <Harness>
      <App api={fakeApi} />
    </Harness>
  );
}
