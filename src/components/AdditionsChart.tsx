import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Card } from '@civitai/blocks-react/ui';

import { blockSize, blocks, plural, type Analysis, type Block } from '../analysis.js';
import { SectionTitle, Thumb } from './common.js';

const HEIGHT = 180;
const TOP = 12;
const BOTTOM = 24;
const LEFT = 32;

/**
 * New creators per block of additions, oldest block on the left. It replaces
 * Discovery's items-per-day chart: Civitai's app API gives the order items were
 * added in but not when.
 */
export function AdditionsChart({ analysis, complete }: { analysis: Analysis; complete: boolean }) {
  const total = analysis.items.length;
  const size = blockSize(total);
  const rows = useMemo(() => blocks(analysis, size), [analysis, size]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Block | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Drawn to the frame's own width, so labels keep their size in a narrow slot.
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    if (node.clientWidth > 0) setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry.contentRect.width);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plot = HEIGHT - TOP - BOTTOM;
  const max = Math.max(1, ...rows.map(row => row.newCreators));
  const tick = Math.max(1, Math.ceil(max / 4));
  const ceiling = tick * Math.ceil(max / tick);
  const column = (width - LEFT - 4) / Math.max(1, rows.length);
  const bar = Math.max(3, Math.min(column - 2, 24));
  const every = Math.max(1, Math.ceil(64 / column));
  const busiest = rows.reduce<Block | null>((best, row) => (row.newCreators > (best?.newCreators ?? -1) ? row : best), null);
  const label = (row: Block) => `Additions ${(total - row.end).toLocaleString()}–${(total - row.start).toLocaleString()}`;
  const choose = (row: Block) => setSelected(current => (current === row.number ? null : row.number));
  const chosen = rows.find(row => row.number === selected) ?? null;

  if (!rows.length) return null;
  return (
    <Card className="ca-card">
      <SectionTitle note={`Oldest additions on the left, in blocks of ${size.toLocaleString()}. ` +
        (complete ? '' : `Only the ${total.toLocaleString()} most recent additions were read, so "new" means new among those. `) +
        (busiest ? `Most new names: ${label(busiest).toLowerCase()}, with ${plural(busiest.newCreators, 'new creator')}.` : '')}>
        New creators over the collection's life
      </SectionTitle>
      <div className="ca-chart" ref={frame}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img"
          aria-label={`New creators per block of ${size} additions. ${rows.length} blocks.`}>
          {Array.from({ length: ceiling / tick + 1 }, (_, i) => i * tick).map(value => {
            const y = TOP + plot - (value / ceiling) * plot;
            return (
              <g key={value}>
                <line x1={LEFT} x2={width - 4} y1={y} y2={y} className={value ? 'ca-grid' : 'ca-axis'} />
                <text x={LEFT - 6} y={y + 4} textAnchor="end" className="ca-tick">{value}</text>
              </g>
            );
          })}
          {rows.map((row, i) => {
            const x = LEFT + i * column;
            const h = (row.newCreators / ceiling) * plot;
            const bx = x + (column - bar) / 2;
            const r = Math.min(4, bar / 2, h);
            return (
              <g key={row.number}>
                {row.newCreators > 0 && (
                  <path
                    className={`ca-bar${row.number === selected ? ' selected' : ''}`}
                    d={`M${bx},${TOP + plot}V${TOP + plot - h + r}Q${bx},${TOP + plot - h} ${bx + r},${TOP + plot - h}` +
                      `H${bx + bar - r}Q${bx + bar},${TOP + plot - h} ${bx + bar},${TOP + plot - h + r}V${TOP + plot}Z`}
                  />
                )}
                {i % every === 0 && (
                  <text x={x + column / 2} y={HEIGHT - 8} textAnchor="middle" className="ca-tick">
                    {(total - row.end).toLocaleString()}
                  </text>
                )}
                <rect
                  x={x} y={TOP} width={column} height={plot} className="ca-hit" tabIndex={0} role="button"
                  aria-label={`${label(row)}: ${plural(row.newCreators, 'new creator')}`}
                  aria-pressed={row.number === selected}
                  onMouseEnter={() => setHover(row)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(row)} onBlur={() => setHover(null)}
                  onClick={() => choose(row)}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(row); }
                  }}
                />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="ca-tooltip" role="status"
            style={{ left: `${((LEFT + (rows.indexOf(hover) + 0.5) * column) / width) * 100}%` }}>
            <strong>{plural(hover.newCreators, 'new creator')}</strong>
            <span>{label(hover)} · {plural(hover.items, 'item')}</span>
          </div>
        )}
      </div>
      {chosen && (
        <div className="ca-block-items">
          <div className="ca-row-between">
            <strong>{label(chosen)}</strong>
            <button type="button" className="ca-link" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="ca-thumbs">
            {analysis.items.slice(chosen.start, chosen.end + 1).map(entry => <Thumb key={entry.mediaId} entry={entry} />)}
          </div>
        </div>
      )}
    </Card>
  );
}
