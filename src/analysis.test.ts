// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import type { MediaItem } from './api.js';
import {
  additionsAgo, analyse, collectionTitle, itemNoun, medianGap,
  previousFromCreator, snippet, thumbUrl, topShare,
} from './analysis.js';

let next = 1;
const item = (username: string | null, type: 'image' | 'video' = 'image', userId?: number): MediaItem => ({
  mediaId: next++, type, url: null, width: 1, height: 1, nsfwLevel: 1,
  creator: username === null ? null : { userId: userId ?? username.length * 1000 + username.charCodeAt(0), username },
});

// Newest added first, as Civitai serves them.
const sample = () => [item('ann'), item('bob'), item('ann'), item('cy'), item('ann'), item('bob')];

describe('analyse', () => {
  it('groups by creator and ranks by count, then name', () => {
    const analysis = analyse(sample());
    expect(analysis.ranked.map(c => [c.name, c.items.length])).toEqual([['ann', 3], ['bob', 2], ['cy', 1]]);
    expect(analysis.items.map(e => e.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keys by user id, falling back to the name, and names the unknown', () => {
    const analysis = analyse([item('Same', 'image', 7), item('same', 'image', 7), item(null)]);
    expect(analysis.creators.size).toBe(2);
    expect(analysis.ranked[1].name).toBe('Unknown creator');
  });

  it('finds the previous pick from the same creator', () => {
    const analysis = analyse(sample());
    expect(previousFromCreator(analysis, analysis.items[0])?.index).toBe(2);
    expect(previousFromCreator(analysis, analysis.items[3])).toBeNull();
  });

  it('measures shares and the middle gap', () => {
    const analysis = analyse(sample());
    expect(topShare(analysis, 1)).toBeCloseTo(0.5);
    expect(topShare(analysis, 5)).toBe(1);
    expect(medianGap(analysis.ranked[0])).toBe(2);
    expect(medianGap(analysis.ranked[2])).toBeNull();
  });
});

describe('wording', () => {
  it('names what a collection holds', () => {
    expect(itemNoun([{ type: 'video' }, { type: 'video' }])).toBe('videos');
    expect(itemNoun([{ type: 'image' }])).toBe('image');
    expect(itemNoun([{ type: 'image' }, { type: 'video' }])).toBe('items');
    expect(additionsAgo(0)).toBe('the most recent addition');
    expect(additionsAgo(1)).toBe('1 addition ago');
  });

  it('links the collection name as written', () => {
    expect(collectionTitle('Music Focus 🎸')).toBe('The [Music Focus 🎸] collection');
    expect(collectionTitle('My collection')).toBe('The [My collection]');
  });
});

describe('snippet', () => {
  const values = { creators: '12', items: '1,234', noun: 'videos' };

  it('renders Civitai-safe markup and the plain text', () => {
    const { html, text } = snippet({ title: 'The [Picks] list', lines: '{creators} creators\n\n{items} {noun}', heading: 'h2' },
      values, 'https://civitai.com/collections/5');
    expect(html).toBe('<h2>The <a href="https://civitai.com/collections/5">Picks</a> list</h2><p><strong>12</strong> creators<br><strong>1,234</strong> videos</p>');
    expect(text).toBe('The Picks list\n12 creators\n1,234 videos');
  });

  it('escapes everything typed', () => {
    const { html } = snippet({ title: '<b>[x"y]</b>', lines: '<script>{unknown}', heading: 'p' }, values, 'https://civitai.com/c?a=1&b=2');
    expect(html).toBe('<p><strong>&lt;b&gt;<a href="https://civitai.com/c?a=1&amp;b=2">x&quot;y</a>&lt;/b&gt;</strong></p><p>&lt;script&gt;{unknown}</p>');
  });
});

describe('thumbUrl', () => {
  const base = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0a1b-uuid/original=true/0a1b-uuid.jpeg';

  it('sizes images and takes a still from videos', () => {
    expect(thumbUrl(base, 'image')).toBe('https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0a1b-uuid/width=320/0a1b-uuid.jpeg');
    expect(thumbUrl(base.replace('.jpeg', '.mp4'), 'video', 450))
      .toBe('https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0a1b-uuid/anim=false,transcode=true,width=450/0a1b-uuid.jpeg');
  });

  it('adds the transform when there is none, and leaves other hosts alone', () => {
    expect(thumbUrl('https://image.civitai.com/key/uuid/name.png', 'image')).toBe('https://image.civitai.com/key/uuid/width=320/name.png');
    expect(thumbUrl('https://example.com/a.png', 'image')).toBe('https://example.com/a.png');
    expect(thumbUrl('https://example.com/a.mp4', 'video')).toBeNull();
    expect(thumbUrl(null, 'image')).toBeNull();
  });
});

describe('snippet placeholders', () => {
  it('ignores inherited names such as {constructor}', () => {
    expect(snippet({ title: 'x', lines: '{constructor} {toString}', heading: 'p' }, {}, 'https://civitai.com/collections/1').text)
      .toBe('x\n{constructor} {toString}');
  });
});
