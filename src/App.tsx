import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBlockContext, useBlockResize, useRequestSignIn } from '@civitai/blocks-react';
import { Alert, Badge, Button, Card, Group, Loader, Select, Stack, TextInput } from '@civitai/blocks-react/ui';

import { analyse, itemNoun, plural, topShare, type Analysis } from './analysis.js';
import {
  parseCollectionRef, readCollection, readMyCollections, type ApiClient, type CollectionRead, type CollectionSummary,
} from './api.js';
import { AdditionsChart } from './components/AdditionsChart.js';
import { CivitaiLink, OpenProvider, StatTile, profilePath } from './components/common.js';
import { CreatorLookup, RecentPicks, TopCreators } from './components/Creators.js';
import { SnippetEditor } from './components/SnippetEditor.js';

type Report =
  | { status: 'idle' }
  | { status: 'loading'; id: number; read: number }
  | { status: 'error'; id: number; message: string }
  | { status: 'ready'; data: CollectionRead; analysis: Analysis };

export function App({ api }: { api: ApiClient }) {
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
    body = <Collectalytics api={api} />;
  }

  return (
    <OpenProvider>
      <main ref={root} className="app" data-theme={theme}>
        <header className="ca-header">
          <h1>Collectalytics</h1>
          <p className="ca-dimmed">Who you collect, how often, and a stats blurb to share.</p>
        </header>
        {body}
      </main>
    </OpenProvider>
  );
}

function Collectalytics({ api }: { api: ApiClient }) {
  const [mine, setMine] = useState<CollectionSummary[] | null>(null);
  const [mineComplete, setMineComplete] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [linkText, setLinkText] = useState('');
  const [report, setReport] = useState<Report>({ status: 'idle' });
  const [creatorKey, setCreatorKey] = useState<string | null>(null);
  const reading = useRef<AbortController | null>(null);
  const listing = useRef<AbortController | null>(null);
  // Set once the viewer (or the first load) has opened something, so a list
  // that finishes late never replaces their choice.
  const chosen = useRef(false);

  const open = useCallback(async (id: number) => {
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
      // Opens on whoever was added last: the question is usually about the newest pick.
      setCreatorKey(analysis.items[0]?.creatorKey ?? null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setReport({ status: 'error', id, message: error instanceof Error ? error.message : String(error) });
    }
  }, [api]);

  const loadMine = useCallback(async () => {
    listing.current?.abort();
    const controller = new AbortController();
    listing.current = controller;
    setMineError(null);
    try {
      const { collections, complete } = await readMyCollections(api, controller.signal);
      if (controller.signal.aborted) return;
      setMine(collections);
      setMineComplete(complete);
      if (!chosen.current && collections[0]) open(collections[0].id);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMine([]);
      setMineError(error instanceof Error ? error.message : String(error));
    }
  }, [api, open]);

  useEffect(() => {
    loadMine();
    return () => {
      listing.current?.abort();
      reading.current?.abort();
    };
  }, [loadMine]);

  const linkId = parseCollectionRef(linkText);
  const options = useMemo(() => {
    const list = (mine ?? []).map(item => ({
      value: String(item.id),
      label: `${item.name}${item.isPublic ? '' : ' (private)'} · ${item.itemCount.toLocaleString()}`,
    }));
    if (selected != null && !list.some(option => option.value === String(selected))) {
      const name = report.status === 'ready' ? report.data.collection.name : `Collection ${selected}`;
      list.push({ value: String(selected), label: `${name} · opened by link` });
    }
    return list;
  }, [mine, selected, report]);

  const busy = report.status === 'loading';
  return (
    <Stack gap="1rem">
      <Card className="ca-card">
        <div className="ca-picker">
          <Select
            label="Your collections"
            placeholder={mine === null ? 'Reading your collections…' : mine.length ? 'Pick a collection' : 'No collections of your own'}
            value={selected != null ? String(selected) : ''}
            options={options}
            disabled={!options.length}
            onChange={value => open(Number(value))}
          />
          <form className="ca-link-form" onSubmit={event => { event.preventDefault(); if (linkId) { open(linkId); setLinkText(''); } }}>
            <TextInput label="Or open a public collection" placeholder="Collection link or ID" value={linkText}
              onChange={event => setLinkText(event.currentTarget.value)} />
            <Button type="submit" variant="light" disabled={!linkId || busy}>Open</Button>
          </form>
        </div>
        {mineError && <Alert color="error" title="Could not list your collections">{mineError}</Alert>}
        {!mineComplete && (
          <p className="ca-dimmed">Civitai stopped listing your collections early; some may be missing. Open one by link instead.</p>
        )}
        {mine && !mine.length && !mineError && (
          <p className="ca-dimmed">
            You have no public collections of your own. Collections you follow are not listed to apps;
            paste one's link above to open it.
          </p>
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
        <ReportView data={report.data} analysis={report.analysis} creatorKey={creatorKey} onCreator={setCreatorKey}
          onRefresh={() => { open(report.data.collection.id); loadMine(); }} />
      )}
    </Stack>
  );
}

function ReportView({ data, analysis, creatorKey, onCreator, onRefresh }: {
  data: CollectionRead; analysis: Analysis; creatorKey: string | null;
  onCreator: (key: string | null) => void; onRefresh: () => void;
}) {
  const { collection, items } = data;
  const noun = itemNoun(items);
  const newest = analysis.items[0];
  const newestCreator = newest ? analysis.creators.get(newest.creatorKey)! : null;
  const pickCreator = (key: string) => {
    onCreator(key);
    document.getElementById('ca-creator')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
              <Badge size="sm" variant="light">{collection.isPublic ? 'Public' : 'Private'}</Badge>
              {collection.followed && <Badge size="sm" variant="outline">Following</Badge>}
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
        <p className="ca-dimmed ca-footnote">
          {plural(items.length, 'accepted item')} read at {data.fetchedAt.toLocaleTimeString(undefined, { timeStyle: 'short' })}.
          {!data.complete && ' Civitai did not hand over the whole collection, so only the most recently added items read are counted.'}
          {' '}Counts cover images and videos you can view on this site. Civitai does not give apps the date each was added, so recency is
          measured in additions, newest first. Contest collections are served shuffled, so for those the order-based figures do not apply.
        </p>
      </Card>

      {items.length > 0 ? (
        <>
          <AdditionsChart key={collection.id} analysis={analysis} complete={data.complete} />
          <div className="ca-columns">
            <RecentPicks analysis={analysis} complete={data.complete} onCreator={pickCreator} />
            <TopCreators analysis={analysis} selected={creatorKey} onCreator={pickCreator} />
          </div>
          <CreatorLookup key={collection.id} analysis={analysis} selected={creatorKey} onCreator={onCreator} />
        </>
      ) : (
        <Alert color="info">Nothing in this collection is visible to you here yet.</Alert>
      )}
      <SnippetEditor collectionId={collection.id} name={collection.name} url={`https://civitai.com/collections/${collection.id}`} values={values} />
    </Stack>
  );
}
