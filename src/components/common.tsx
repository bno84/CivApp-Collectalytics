import { createContext, useContext, useState, type ReactNode } from 'react';

import { useCivitaiNavigate } from '@civitai/blocks-react';

import { thumbUrl, type Entry } from '../analysis.js';

// A sandboxed frame cannot open links itself, so every link to Civitai goes
// through the host, in a new tab.
type Open = (path: string) => void;
const OpenContext = createContext<Open>(() => {});

export function OpenProvider({ children }: { children: ReactNode }) {
  const { navigate } = useCivitaiNavigate();
  return <OpenContext.Provider value={path => navigate(path, 'new_tab')}>{children}</OpenContext.Provider>;
}

export const useOpen = () => useContext(OpenContext);

export function CivitaiLink({ path, children, className = '' }: { path: string | null; children: ReactNode; className?: string }) {
  const open = useOpen();
  if (!path) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={`ca-link ${className}`} onClick={() => open(path)}>
      {children}
    </button>
  );
}

export const profilePath = (name: string | null | undefined) =>
  name ? `/user/${encodeURIComponent(name)}` : null;

export function Thumb({ entry, caption }: { entry: Entry; caption?: string }) {
  const open = useOpen();
  const [failed, setFailed] = useState(false);
  const src = thumbUrl(entry.url, entry.type);
  const who = entry.creator?.username || 'Unknown creator';
  return (
    <button
      type="button"
      className="ca-thumb"
      onClick={() => open(`/images/${entry.mediaId}`)}
      title={`${who} · ${entry.index === 0 ? 'most recent addition' : `#${entry.index + 1} most recent`} · open on Civitai`}
      aria-label={`${entry.type === 'video' ? 'Video' : 'Image'} by ${who}, open on Civitai`}
    >
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="ca-thumb-missing">{entry.type}</span>
      )}
      {entry.type === 'video' && <span className="ca-thumb-badge" aria-hidden="true">▶</span>}
      {caption && <span className="ca-thumb-caption">{caption}</span>}
    </button>
  );
}

export function StatTile({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="ca-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <header className="ca-section-head">
      <h2>{children}</h2>
      {note && <p className="ca-dimmed">{note}</p>}
    </header>
  );
}
