// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBlockContext, useBlockResize, useRequestSignIn } from '@civitai/blocks-react';
import { Alert, Button, Card, Group, Loader, Select, Stack, TextInput } from '@civitai/blocks-react/ui';

import { analyse, itemNoun, plural, topShare, type Analysis } from './analysis.js';
import {
  parseCollectionRef, readCollection, readMyCollections, type ApiClient, type CollectionRead,
  type CollectionSummary,
} from './api.js';
import { AdditionsChart } from './components/AdditionsChart.js';
import { CivitaiLink, OpenProvider, StatTile, profilePath } from './components/common.js';
import { CreatorLookup, RecentPicks, TopCreators } from './components/Creators.js';
import { SnippetEditor } from './components/SnippetEditor.js';
import type { Memory, RecentCollection } from './memory.js';

const SOURCE_URL = 'https://github.com/bno84/CivApp-Collectalytics';

type Report =
  | { status: 'idle' }
  | { status: 'loading'; id: number; read: number }
  | { status: 'error'; id: number; message: string }
  | { status: 'ready'; data: CollectionRead; analysis: Analysis };

export function App({ api, memory }: { api: ApiClient; memory: Memory }) {
  const { ready, viewer, theme } = useBlockContext();
  const { requestSignIn } = useRequestSignIn();
  const root = useRef<HTMLDivElement>(null);
  useBlockResize(root);

  // The page behind the app follows the host's theme; index.html seeds it pre-paint.
  useEffect(() => {
    if (ready) document.documentElement.dataset.theme = theme;
  }, [ready, theme]);

  let body;
  if (!ready) {
    body = <Group justify="center"><Loader /></Group>;
  } else if (!viewer) {
    body = (
      <Card className="ca-card">
        <Stack gap="0.75rem">
          <p>Sign in to Civitai to see statistics for your collections.</p>
          <Button onClick={() => requestSignIn()}>Sign in</Button>
        </Stack>
      </Card>
    );
  } else {
    body = <Collectalytics api={api} memory={memory} />;
  }

  return (
    <OpenProvider>
      <main ref={root} className="app" data-theme={theme}>
        <header className="ca-header">
          <h1>Collectalytics</h1>
          <p className="ca-dimmed">Who you collect, how often, and a stats blurb to share.</p>
        </header>
        {body}
        {/* AGPL-3.0 §13: offer the source to everyone who uses the app. The
            sandbox allows no popups, so the URL is plain selectable text. */}
        <footer className="ca-footer ca-dimmed">
          Free software under AGPL-3.0-or-later. Source:{' '}
          <span className="ca-source-url">{SOURCE_URL}</span>
        </footer>
      </main>
    </OpenProvider>
  );
}

function Collectalytics({ api, memory }: { api: ApiClient; memory: Memory }) {
  const [mine, setMine] = useState<CollectionSummary[] | null>(null);
  const [mineComplete, setMineComplete] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [linkText, setLinkText] = useState('');
  const [report, setReport] = useState<Report>({ status: 'idle' });
  const [creatorKey, setCreatorKey] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCollection[]>([]);
  const reading = useRef<AbortController | null>(null);
  const listing = useRef<AbortController | null>(null);
  // Set once the viewer (or the first load) has opened something, so a list
  // that finishes late never replaces their choice.
  const chosen = useRef(false);

  useEffect(() => {
    let live = true;
    memory.recent().then(entries => { if (live) setRecent(entries); });
    return () => { live = false; };
  }, [memory]);

  /**
   * `byLink`: the viewer named this collection, so it joins the recent list once
   * it reads. `fallback`: what to open instead if it cannot be read, for the
   * remembered collection on load, which may have gone private or away since.
   */
  const open = useCallback(async (id: number, { byLink = false, fallback }: { byLink?: boolean; fallback?: number } = {}) => {
    chosen.current = true;
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setSelected(id);
    setReport({ status: 'loading', id, read: 0 });
    try {
      const data = await readCollection(api, id, {
        signal: controller.signal,
        onProgress: read => { if (!controller.signal.aborted) setReport({ status: 'loading', id, read }); },
      });
      if (controller.signal.aborted) return;
      const analysis = analyse(data.items);
      setReport({ status: 'ready', data, analysis });
      memory.setLastOpened(id);
      if (byLink) {
        const { name, curator } = data.collection;
        memory.remember({ id, name, curator: curator.username });
        memory.recent().then(setRecent);
      }
      // Opens on whoever was added last: the question is usually about the newest pick.
      setCreatorKey(analysis.items[0]?.creatorKey ?? null);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (fallback != null) return void open(fallback);
      setReport({ status: 'error', id, message: error instanceof Error ? error.message : String(error) });
    }
  }, [api, memory]);

  const forget = (id: number) => {
    setRecent(entries => entries.filter(entry => entry.id !== id));
    memory.forget(id);
  };

  const loadMine = useCallback(async () => {
    listing.current?.abort();
    const controller = new AbortController();
    listing.current = controller;
    setMineError(null);
    // Read alongside the list: on load, the collection open last time comes first.
    const last = memory.lastOpened();
    let first: number | undefined;
    try {
      const { collections, complete } = await readMyCollections(api, controller.signal);
      if (controller.signal.aborted) return;
      setMine(collections);
      setMineComplete(complete);
      first = collections[0]?.id;
    } catch (error) {
      if (controller.signal.aborted) return;
      setMine([]);
      setMineError(error instanceof Error ? error.message : String(error));
    }
    const remembered = await last;
    if (controller.signal.aborted || chosen.current) return;
    if (remembered != null) open(remembered, { fallback: remembered === first ? undefined : first });
    else if (first != null) open(first);
  }, [api, memory, open]);

  useEffect(() => {
    loadMine();
    return () => {
      listing.current?.abort();
      reading.current?.abort();
    };
  }, [loadMine]);

  const linkId = parseCollectionRef(linkText);
  const ownedIds = useMemo(() => new Set((mine ?? []).map(item => item.id)), [mine]);
  // Your own are in the list above already.
  const recentOthers = recent.filter(entry => !ownedIds.has(entry.id));
  const options = (mine ?? []).map(item => ({
    value: String(item.id),
    label: `${item.name}${item.isPublic ? '' : ' (private)'} · ${item.itemCount.toLocaleString()}`,
  }));

  const busy = report.status === 'loading';
  return (
    <Stack gap="1rem">
      <Card className="ca-card">
        <div className="ca-picker">
          <Select
            label="Your collections"
            placeholder={mine === null ? 'Reading your collections…' : mine.length ? 'Pick a collection' : 'No collections of your own'}
            value={selected != null && ownedIds.has(selected) ? String(selected) : ''}
            options={options}
            disabled={!options.length}
            onChange={value => open(Number(value))}
          />
          <form className="ca-link-form" onSubmit={event => { event.preventDefault(); if (linkId) { open(linkId, { byLink: true }); setLinkText(''); } }}>
            <TextInput label="Or any public collection" placeholder="Paste a collection link or ID" value={linkText}
              onChange={event => setLinkText(event.currentTarget.value)} />
            <Button type="submit" variant="light" disabled={!linkId || busy}>Open</Button>
          </form>
          {recentOthers.length > 0 && (
            <RecentLinks entries={recentOthers} selected={selected} disabled={busy}
              onOpen={id => open(id, { byLink: true })} onForget={forget} />
          )}
        </div>
        {mineError && <Alert color="error" title="Could not list your collections">{mineError}</Alert>}
        {!mineComplete && (
          <p className="ca-dimmed">Civitai stopped listing your collections early; some may be missing. Open one by link instead.</p>
        )}
        {mine && !mine.length && !mineError && (
          <p className="ca-dimmed">You have no public collections of your own yet.</p>
        )}
      </Card>

      {report.status === 'loading' && (
        <Card className="ca-card">
          <Group gap="0.75rem">
            <Loader size="sm" />
            <span>Reading the collection from Civitai… {report.read ? `${report.read.toLocaleString()} items so far.` : ''}</span>
          </Group>
        </Card>
      )}
      {report.status === 'error' && (
        <Alert color="error" title="Could not read this collection">
          {report.message}{' '}
          <Button variant="subtle" size="sm" onClick={() => open(report.id)}>Try again</Button>
        </Alert>
      )}
      {report.status === 'ready' && (
        <ReportView memory={memory} data={report.data} analysis={report.analysis} owned={ownedIds.has(report.data.collection.id)}
          creatorKey={creatorKey} onCreator={setCreatorKey}
          onRefresh={() => { open(report.data.collection.id); loadMine(); }} />
      )}
    </Stack>
  );
}

function RecentLinks({ entries, selected, disabled, onOpen, onForget }: {
  entries: RecentCollection[]; selected: number | null; disabled: boolean;
  onOpen: (id: number) => void; onForget: (id: number) => void;
}) {
  return (
    <div className="ca-recent">
      <span className="ca-label">Opened before</span>
      <ul className="ca-recent-list">
        {entries.map(entry => (
          <li key={entry.id} className={entry.id === selected ? 'ca-recent-item is-selected' : 'ca-recent-item'}>
            <button type="button" className="ca-recent-open" disabled={disabled} onClick={() => onOpen(entry.id)}
              title={entry.curator ? `${entry.name}, by ${entry.curator}` : entry.name}>
              <span className="ca-recent-name">{entry.name}</span>
              {entry.curator && <span className="ca-dimmed"> · {entry.curator}</span>}
            </button>
            <button type="button" className="ca-recent-forget" aria-label={`Forget ${entry.name}`}
              title="Forget" onClick={() => onForget(entry.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportView({ memory, data, analysis, owned, creatorKey, onCreator, onRefresh }: {
  memory: Memory; data: CollectionRead; analysis: Analysis; owned: boolean; creatorKey: string | null;
  onCreator: (key: string | null) => void; onRefresh: () => void;
}) {
  const { collection, items } = data;
  const noun = itemNoun(items);
  const newest = analysis.items[0];
  const newestCreator = newest ? analysis.creators.get(newest.creatorKey)! : null;
  const pickCreator = (key: string) => {
    onCreator(key);
    // Side by side with the lists (wide layout) the creator check is already in
    // view. Only when it is stacked below them is it worth scrolling to.
    const check = document.getElementById('ca-creator');
    const first = check?.parentElement?.firstElementChild as HTMLElement | null;
    if (check && first && check.offsetTop > first.offsetTop) {
      check.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };
  const values = { creators: analysis.creators.size.toLocaleString(), items: items.length.toLocaleString(), noun };

  return (
    <Stack gap="1rem">
      <Card className="ca-card">
        <div className="ca-row-between ca-collection-head">
          <div>
            <h2 className="ca-collection-name">
              <CivitaiLink path={`/collections/${collection.id}`}>{collection.name}</CivitaiLink>
            </h2>
            <Group gap="0.5rem">
              <span className="ca-dimmed">
                By <CivitaiLink path={profilePath(collection.curator.username)}>{collection.curator.username ?? 'unknown'}</CivitaiLink>
              </span>
              {owned && <span className="ca-tag ca-tag-yours">Yours</span>}
              {!owned && collection.followed && <span className="ca-tag ca-tag-following">Following</span>}
              {!owned && !collection.followed && <span className="ca-tag">Not followed</span>}
              {!collection.isPublic && <span className="ca-tag">Private</span>}
            </Group>
          </div>
          <Button variant="subtle" size="sm" onClick={onRefresh}>Refresh</Button>
        </div>
        <div className="ca-stats">
          <StatTile value={items.length.toLocaleString()} label={`${noun} collected`} />
          <StatTile value={analysis.creators.size.toLocaleString()} label="unique creators" />
          <StatTile value={`${(topShare(analysis, 5) * 100).toFixed(0)}%`} label="from the top five creators" />
          {newestCreator && <StatTile value={newestCreator.name} label="added most recently" />}
        </div>
        {!data.complete && (
          <p className="ca-dimmed">Only the {plural(items.length, 'most recent item')} could be read.</p>
        )}
      </Card>

      {items.length > 0 ? (
        <>
          <AdditionsChart />
          <div className="ca-columns">
            <RecentPicks analysis={analysis} complete={data.complete} selected={creatorKey} onCreator={pickCreator} />
            <TopCreators analysis={analysis} selected={creatorKey} onCreator={pickCreator} />
            <CreatorLookup key={collection.id} analysis={analysis} selected={creatorKey} onCreator={onCreator} />
          </div>
        </>
      ) : (
        <Alert color="info" title="No images or videos to count">
          Collectalytics counts image and video collections. Collections of models, posts or articles
          are not supported yet, because Civitai does not share those items with apps. Images above your
          browsing level are left out too.
        </Alert>
      )}
      <SnippetEditor memory={memory} collectionId={collection.id} name={collection.name} url={`https://civitai.com/collections/${collection.id}`} values={values} />
    </Stack>
  );
}
