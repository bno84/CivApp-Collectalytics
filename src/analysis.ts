// Collectalytics' counting, kept free of React so it can be tested on its own.
//
// Civitai's block API gives a collection's items newest added first but without
// the date each was added. Where Discovery measured time ("3 days ago", items
// per day), this measures position in that order: "added 12 picks ago", new
// creators per block of additions.
import type { MediaItem } from './api.js';

export interface Entry extends MediaItem {
  /** Position in the collection, 0 being the most recently added. */
  index: number;
  creatorKey: string;
}

export interface Creator {
  key: string;
  name: string;
  userId: number | null;
  /** Their items, newest added first. */
  items: Entry[];
}

export interface Analysis {
  items: Entry[];
  creators: Map<string, Creator>;
  /** Most items first, then by name. */
  ranked: Creator[];
}

export function creatorKey(item: Pick<MediaItem, 'creator'>): string {
  if (item.creator?.userId != null) return `id:${item.creator.userId}`;
  return `name:${(item.creator?.username ?? '').toLowerCase()}`;
}

export function analyse(raw: MediaItem[]): Analysis {
  const creators = new Map<string, Creator>();
  const items = raw.map((item, index): Entry => {
    const key = creatorKey(item);
    const entry = { ...item, index, creatorKey: key };
    let creator = creators.get(key);
    if (!creator) {
      creator = { key, name: item.creator?.username || 'Unknown creator', userId: item.creator?.userId ?? null, items: [] };
      creators.set(key, creator);
    }
    creator.items.push(entry);
    return entry;
  });
  const ranked = [...creators.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  return { items, creators, ranked };
}

/** The creator's addition before this one, or null when this was their first. */
export function previousFromCreator(analysis: Analysis, entry: Entry): Entry | null {
  const own = analysis.creators.get(entry.creatorKey)!.items;
  return own[own.indexOf(entry) + 1] ?? null;
}

/** Share of the collection held by the top `count` creators, 0..1. */
export function topShare(analysis: Analysis, count: number): number {
  const total = analysis.items.length;
  if (!total) return 0;
  return analysis.ranked.slice(0, count).reduce((sum, creator) => sum + creator.items.length, 0) / total;
}

/** The middle gap, in additions, between a creator's consecutive picks. */
export function medianGap(creator: Creator): number | null {
  const gaps = creator.items.slice(0, -1).map((item, i) => creator.items[i + 1].index - item.index);
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export interface Block {
  /** Oldest block first. */
  number: number;
  /** Item positions covered, newest-first indexing: from `end` (older) to `start`. */
  start: number;
  end: number;
  items: number;
  newCreators: number;
}

const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/** A round block size giving at most `bars` blocks. */
export function blockSize(total: number, bars = 40): number {
  const wanted = Math.ceil(total / bars);
  return NICE.find(size => size >= wanted) ?? wanted;
}

/**
 * The collection in blocks of `size` additions, oldest first, with how many
 * creators made their first appearance in each. The newest block may be partial.
 */
export function blocks(analysis: Analysis, size: number): Block[] {
  const total = analysis.items.length;
  const result: Block[] = [];
  const met = new Set<string>();
  for (let chrono = 0; chrono < total; chrono++) {
    const entry = analysis.items[total - 1 - chrono];
    const number = Math.floor(chrono / size);
    if (!result[number]) result[number] = { number, start: entry.index, end: entry.index, items: 0, newCreators: 0 };
    const block = result[number];
    block.start = entry.index;
    block.items++;
    if (!met.has(entry.creatorKey)) {
      met.add(entry.creatorKey);
      block.newCreators++;
    }
  }
  return result;
}

/** What the collection is "of", for "177 videos collected". */
export function itemNoun(items: Pick<MediaItem, 'type'>[]): string {
  const kinds = new Set(items.map(item => item.type));
  const word = kinds.size === 1 ? [...kinds][0] : 'item';
  return items.length === 1 ? word : `${word}s`;
}

export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : many}`;
}

/** "the most recent addition", "3 additions ago". */
export function additionsAgo(index: number): string {
  return index === 0 ? 'the most recent addition' : `${plural(index, 'addition')} ago`;
}

// -- snippet ------------------------------------------------------------------------

export const DEFAULT_LINES = '{creators} unique creators\n{items} {noun} collected';
export type Heading = 'h2' | 'h3' | 'p';

export interface SnippetSettings {
  title: string;
  lines: string;
  heading: Heading;
}

/** The collection's name is its brand, so it is linked exactly as written. */
export function collectionTitle(name: string): string {
  const clean = name.trim() || 'Untitled';
  return /\bcollection\b/i.test(clean) ? `The [${clean}]` : `The [${clean}] collection`;
}

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The snippet as Civitai-safe HTML and as plain text. Only tags that survive the
 * article editor, model and post descriptions are produced: a heading (or a bold
 * line), one paragraph with line breaks, <strong> and a plain link. Everything
 * typed is escaped; only the placeholders gain markup.
 */
export function snippet({ title, lines, heading }: SnippetSettings, values: Record<string, string>, url: string) {
  const fill = (text: string, html: boolean) => text.split(/(\{\w+\})/).map(part => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (!name || !(name in values)) return html ? escapeHTML(part) : part;
    if (!html) return values[name];
    return name === 'noun' ? escapeHTML(values[name]) : `<strong>${escapeHTML(values[name])}</strong>`;
  }).join('');
  const match = title.match(/^(.*?)\[(.+?)\](.*)$/s);
  const titleHTML = match
    ? `${escapeHTML(fill(match[1], false))}<a href="${escapeHTML(url)}">${escapeHTML(fill(match[2], false))}</a>${escapeHTML(fill(match[3], false))}`
    : escapeHTML(fill(title, false));
  const titleText = fill(title.replace(/\[(.+?)\]/s, '$1'), false);
  const body = lines.split('\n').map(line => line.trim()).filter(Boolean);
  const head = heading === 'p' ? `<p><strong>${titleHTML}</strong></p>` : `<${heading}>${titleHTML}</${heading}>`;
  const html = body.length ? `${head}<p>${body.map(line => fill(line, true)).join('<br>')}</p>` : head;
  const text = [titleText, ...body.map(line => fill(line, false))].join('\n');
  return { html, text };
}

// -- media --------------------------------------------------------------------------

/**
 * A small still from Civitai's image CDN. The block API serves `original=true`
 * links; the transform segment is swapped for a width (and, for a video, a
 * transcoded first frame).
 */
export function thumbUrl(url: string | null, type: 'image' | 'video', width = 320): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)civitai\.com$/.test(parsed.hostname)) return type === 'image' ? url : null;
  const parts = parsed.pathname.split('/');
  const params = type === 'video' ? `anim=false,transcode=true,width=${width}` : `width=${width}`;
  const at = parts.findIndex((part, i) => i > 1 && i < parts.length - 1 && part.includes('='));
  if (at >= 0) parts[at] = params;
  else parts.splice(parts.length - 1, 0, params);
  if (type === 'video') parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^.]+$/, '') + '.jpeg';
  parsed.pathname = parts.join('/');
  return parsed.toString();
}
