// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card, Group, Select, TextInput, Textarea } from '@civitai/blocks-react/ui';

import { DEFAULT_LINES, collectionTitle, snippet, type Heading, type SnippetSettings } from '../analysis.js';
import type { Memory } from '../memory.js';
import { SectionTitle, useOpen } from './common.js';

/** How long typing pauses before an edit is saved. */
const SAVE_DELAY_MS = 800;

const HEADINGS = [
  { value: 'h2', label: 'Heading' },
  { value: 'h3', label: 'Subheading' },
  { value: 'p', label: 'Bold line' },
];

/**
 * A stats blurb to paste into an article, model or post description. Edits are
 * kept per collection in the viewer's private app storage on Civitai, so they
 * come back next visit (see memory.ts).
 */
export function SnippetEditor({ memory, collectionId, name, url, values }:
  { memory: Memory; collectionId: number; name: string; url: string; values: Record<string, string> }) {
  const open = useOpen();
  const defaults = useMemo<SnippetSettings>(() => ({ title: collectionTitle(name), lines: DEFAULT_LINES, heading: 'h2' }), [name]);
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const pending = useRef<(() => void) & { cancel(): void } | null>(null);

  useEffect(() => {
    let live = true;
    setSettings(defaults);
    setLoading(true);
    memory.snippet(collectionId).then(saved => {
      if (!live) return;
      setSettings(saved ?? defaults);
      setLoading(false);
    });
    return () => {
      live = false;
      // Switching collections, or leaving, saves what was typed last.
      pending.current?.();
    };
  }, [memory, collectionId, defaults]);

  const { html, text } = snippet(settings, values, url);
  const save = (next: SnippetSettings) => {
    setSettings(next);
    setStatus(null);
    const isDefault = next.title === defaults.title && next.lines === defaults.lines && next.heading === defaults.heading;
    pending.current?.cancel();
    const write = Object.assign(() => {
      clearTimeout(timer);
      if (pending.current === write) pending.current = null;
      memory.saveSnippet(collectionId, isDefault ? null : next);
    }, { cancel: () => clearTimeout(timer) });
    const timer = setTimeout(write, SAVE_DELAY_MS);
    pending.current = write;
  };
  const update = (patch: Partial<SnippetSettings>) => save({ ...settings, ...patch });

  async function copy(rich: boolean) {
    const done = (ok: boolean) => setStatus(ok
      ? { text: rich ? 'Copied. Paste it into the Civitai editor.' : 'HTML copied.' }
      : { text: 'The browser refused the clipboard. Select the preview and copy it by hand.', error: true });
    try {
      if (rich && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        return done(true);
      }
      if (!rich && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(html);
        return done(true);
      }
    } catch {
      // The frame may not be allowed the async clipboard; copying a selection still works.
    }
    done(selectionCopy(rich ? preview.current : null, html));
  }

  return (
    <Card className="ca-card">
      <SectionTitle note="Placeholders: {creators}, {items}, {noun}. [Brackets] in the title link to the collection.">
        Stats snippet
      </SectionTitle>
      <div className="ca-snippet">
        <div className="ca-snippet-fields">
          <TextInput label="Title" value={settings.title} disabled={loading} onChange={event => update({ title: event.currentTarget.value })} />
          <Textarea label="Lines" minRows={3} value={settings.lines} disabled={loading} onChange={event => update({ lines: event.currentTarget.value })} />
          <Select label="Title style" value={settings.heading} options={HEADINGS} disabled={loading} onChange={value => update({ heading: value as Heading })} />
          <Button variant="subtle" size="sm" disabled={loading} onClick={() => save(defaults)}>Reset</Button>
        </div>
        <div className="ca-snippet-out">
          <span className="ca-label">Preview</span>
          {/* Every typed character is escaped by snippet(); the tags are a fixed set. */}
          <div className="ca-snippet-preview" ref={preview} dangerouslySetInnerHTML={{ __html: html }}
            onClick={event => {
              // The copied HTML keeps its plain link; in the frame it opens through the host.
              const link = (event.target as Element).closest('a');
              if (!link) return;
              event.preventDefault();
              open(new URL(link.href).pathname);
            }} />
          <Group gap="0.5rem">
            <Button onClick={() => copy(true)}>Copy for Civitai</Button>
            <Button variant="light" onClick={() => copy(false)}>Copy HTML</Button>
          </Group>
          {status && <p className={status.error ? 'ca-error' : 'ca-dimmed'} role="status">{status.text}</p>}
          <details>
            <summary className="ca-dimmed">HTML source</summary>
            <pre className="ca-source">{html}</pre>
          </details>
        </div>
      </div>
    </Card>
  );
}

function selectionCopy(node: HTMLElement | null, html: string): boolean {
  const selection = window.getSelection();
  let scratch: HTMLTextAreaElement | null = null;
  try {
    if (node && selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      scratch = document.createElement('textarea');
      scratch.value = html;
      scratch.className = 'ca-scratch';
      document.body.append(scratch);
      scratch.select();
    }
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    selection?.removeAllRanges();
    scratch?.remove();
  }
}
