import { useState } from 'react';

import { Button, Card, TextInput } from '@civitai/blocks-react/ui';

import {
  additionsAgo, medianGap, plural, previousFromCreator, topShare, type Analysis, type Creator,
} from '../analysis.js';
import { CivitaiLink, SectionTitle, Thumb, profilePath } from './common.js';

const RECENT = 15;
const TOP_CREATORS = 20;
const CREATOR_THUMBS = 36;
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

export function RecentPicks({ analysis, onCreator }: { analysis: Analysis; onCreator: (key: string) => void }) {
  return (
    <Card className="ca-card">
      <SectionTitle note="Newest first, with how long since that creator's previous pick.">Recently added</SectionTitle>
      <ol className="ca-recent">
        {analysis.items.slice(0, RECENT).map(entry => {
          const creator = analysis.creators.get(entry.creatorKey)!;
          const previous = previousFromCreator(analysis, entry);
          const gap = previous ? previous.index - entry.index : null;
          return (
            <li key={entry.mediaId}>
              <Thumb entry={entry} />
              <div>
                <button type="button" className="ca-link ca-strong" onClick={() => onCreator(creator.key)}>{creator.name}</button>
                <small className={gap !== null && gap <= RECENT ? 'ca-accent' : 'ca-dimmed'}>
                  {gap === null
                    ? creator.items.length === 1 ? 'First from this creator' : `First from them · ${creator.items.length} in all`
                    : `Previous from them ${plural(gap, 'addition')} earlier · ${creator.items.length} in all`}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function TopCreators({ analysis, selected, onCreator }:
  { analysis: Analysis; selected: string | null; onCreator: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? analysis.ranked : analysis.ranked.slice(0, TOP_CREATORS);
  const max = analysis.ranked[0]?.items.length || 1;
  return (
    <Card className="ca-card">
      <SectionTitle note={analysis.ranked.length
        ? `The top creator has ${percent(topShare(analysis, 1))} of the collection; the top five have ${percent(topShare(analysis, 5))}.`
        : 'No items yet.'}>
        Top creators
      </SectionTitle>
      <ul className="ca-bars">
        {shown.map(creator => (
          <li key={creator.key}>
            <button type="button" className={`ca-bar-row${creator.key === selected ? ' selected' : ''}`}
              aria-pressed={creator.key === selected} onClick={() => onCreator(creator.key)}
              title={`${creator.name}: ${creator.items.length}, newest pick ${additionsAgo(creator.items[0].index)}`}>
              <span className="ca-bar-name">{creator.name}</span>
              <span className="ca-bar-track"><span style={{ width: `${(creator.items.length / max) * 100}%` }} /></span>
              <span className="ca-bar-value">{creator.items.length.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
      {analysis.ranked.length > TOP_CREATORS && (
        <Button variant="subtle" size="sm" onClick={() => setAll(value => !value)}>
          {all ? `Show top ${TOP_CREATORS}` : `Show all ${analysis.ranked.length.toLocaleString()}`}
        </Button>
      )}
    </Card>
  );
}

export function CreatorLookup({ analysis, selected, onCreator }:
  { analysis: Analysis; selected: string | null; onCreator: (key: string | null) => void }) {
  const creator = selected ? analysis.creators.get(selected) ?? null : null;
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? creator?.name ?? '';
  const names = [...analysis.creators.values()].sort((a, b) => a.name.localeCompare(b.name));

  function find(value: string) {
    setTyped(value);
    const wanted = value.trim().toLowerCase();
    const match = names.find(entry => entry.name.toLowerCase() === wanted);
    onCreator(match?.key ?? null);
  }

  return (
    <Card className="ca-card" id="ca-creator">
      <SectionTitle note="What have I added from them lately?">Creator check</SectionTitle>
      <TextInput label="Creator" placeholder="Type a username" list="ca-creator-names" value={text}
        onChange={event => find(event.currentTarget.value)} onBlur={() => setTyped(null)} />
      <datalist id="ca-creator-names">
        {names.map(entry => <option key={entry.key} value={entry.name} />)}
      </datalist>
      {creator ? (
        <CreatorReport analysis={analysis} creator={creator} />
      ) : (
        <p className="ca-dimmed">{text.trim() ? `Nothing from “${text.trim()}” in this collection.` : 'Type a name, or pick one from the lists.'}</p>
      )}
    </Card>
  );
}

function CreatorReport({ analysis, creator }: { analysis: Analysis; creator: Creator }) {
  const total = analysis.items.length;
  const rank = analysis.ranked.indexOf(creator) + 1;
  const within = (count: number) => creator.items.filter(item => item.index < count).length;
  const gap = medianGap(creator);
  const newest = creator.items[0].index;
  return (
    <div className="ca-creator-report">
      <div className="ca-row-between">
        <CivitaiLink path={profilePath(creator.userId != null ? creator.name : null)} className="ca-creator-name">
          {creator.name}
        </CivitaiLink>
        <span className="ca-dimmed">
          {plural(creator.items.length, 'item')} · #{rank} of {analysis.creators.size.toLocaleString()} · {percent(creator.items.length / (total || 1))}
        </span>
      </div>
      <p>
        Newest pick: <strong>{additionsAgo(newest)}</strong>
        {newest > 0 && ` (${plural(newest, 'addition')} from others since)`}.{' '}
        {within(50).toLocaleString()} in the latest 50 additions, {within(250).toLocaleString()} in the latest 250.
        {gap !== null && ` Typically ${plural(gap, 'addition')} between their picks.`}
      </p>
      <Timeline analysis={analysis} creator={creator} />
      <div className="ca-thumbs">
        {creator.items.slice(0, CREATOR_THUMBS).map(entry => <Thumb key={entry.mediaId} entry={entry} />)}
      </div>
      {creator.items.length > CREATOR_THUMBS && (
        <p className="ca-dimmed">And {(creator.items.length - CREATOR_THUMBS).toLocaleString()} older.</p>
      )}
    </div>
  );
}

/** Every addition as a faint tick, oldest on the left; this creator's as dots. */
function Timeline({ analysis, creator }: { analysis: Analysis; creator: Creator }) {
  const total = analysis.items.length;
  const x = (index: number) => 6 + (total > 1 ? (total - 1 - index) / (total - 1) : 0.5) * 588;
  const step = Math.max(1, Math.ceil(total / 600));
  return (
    <div className="ca-timeline">
      <svg viewBox="0 0 600 40" preserveAspectRatio="none" role="img"
        aria-label={`Where ${creator.name}'s picks sit in the collection, oldest on the left.`}>
        <line x1={6} x2={594} y1={20} y2={20} className="ca-axis" />
        {analysis.items.filter((_, i) => i % step === 0).map(entry => (
          <line key={entry.mediaId} x1={x(entry.index)} x2={x(entry.index)} y1={15} y2={25} className="ca-tick-mark" />
        ))}
        {creator.items.map(entry => (
          <circle key={entry.mediaId} cx={x(entry.index)} cy={20} r={4} className="ca-dot">
            <title>{additionsAgo(entry.index)}</title>
          </circle>
        ))}
      </svg>
      <div className="ca-row-between ca-dimmed"><span>Oldest</span><span>Newest</span></div>
    </div>
  );
}
