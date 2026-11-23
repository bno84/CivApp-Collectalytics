import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Card } from '@civitai/blocks-react/ui';

import { blockSize, blocks, plural, type Analysis, type Block } from '../analysis.js';
import { SectionTitle, Thumb } from './common.js';

const HEIGHT = 200;
const TOP = 12;
const BOTTOM = 24;
const LEFT = 36;
const GAP = 2;

/** A bar segment with its top corners rounded. */
function segment(x: number, y: number, w: number, h: number, round: boolean): string {
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Additions per block, oldest block on the left, split into items from creators
 * new to the collection in that block and items from creators already in it. It
 * replaces Discovery's items-per-day chart: Civitai's app API gives the order
 * items were added in but not when.
 */
export function AdditionsChart({ analysis, complete }: { analysis: Analysis; complete: boolean }) {
  const total = analysis.items.length;
  const size = blockSize(total);
  const rows = useMemo(() => blocks(analysis, size), [analysis, size]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Block | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Drawn to the frame's own width, so labels keep their size in any slot.
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
  const max = Math.max(1, ...rows.map(row => row.items));
  const tick = Math.max(1, Math.ceil(max / 4));
  const ceiling = tick * Math.ceil(max / tick);
  const column = (width - LEFT - 4) / Math.max(1, rows.length);
  const bar = Math.max(3, Math.min(column - 3, 28));
  const every = Math.max(1, Math.ceil(64 / column));
  const label = (row: Block) => `Additions ${(total - row.end).toLocaleString()}–${(total - row.start).toLocaleString()}`;
  const choose = (row: Block) => setSelected(current => (current === row.number ? null : row.number));
  const chosen = rows.find(row => row.number === selected) ?? null;
  const y = (value: number) => TOP + plot - (value / ceiling) * plot;

  if (!rows.length) return null;
  return (
    <Card className="ca-card">
      <SectionTitle note={`Blocks of ${size.toLocaleString()} additions, oldest on the left.` +
        (complete ? '' : ' "New" means new among the items read.')}>
        Additions over the collection's life
      </SectionTitle>
      <ul className="ca-legend" aria-label="Legend">
        <li><span className="ca-swatch ca-swatch-new" />From creators new to the collection</li>
        <li><span className="ca-swatch ca-swatch-returning" />From creators already in it</li>
      </ul>
      <div className="ca-chart" ref={frame}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img"
          aria-label={`Items added per block of ${size}, split by new and returning creators. ${rows.length} blocks.`}>
          {Array.from({ length: ceiling / tick + 1 }, (_, i) => i * tick).map(value => (
            <g key={value}>
              <line x1={LEFT} x2={width - 4} y1={y(value)} y2={y(value)} className={value ? 'ca-grid' : 'ca-axis'} />
              <text x={LEFT - 6} y={y(value) + 4} textAnchor="end" className="ca-tick">{value}</text>
            </g>
          ))}
          {rows.map((row, i) => {
            const x = LEFT + i * column + (column - bar) / 2;
            const fresh = row.newCreatorItems;
            const returning = row.items - fresh;
            const freshTop = y(fresh);
            const allTop = y(row.items);
            const dim = selected !== null && row.number !== selected ? ' dim' : '';
            return (
              <g key={row.number}>
                {fresh > 0 && (
                  <path className={`ca-bar-new${dim}`} d={segment(x, freshTop, bar, y(0) - freshTop, returning === 0)} />
                )}
                {returning > 0 && (
                  <path className={`ca-bar-returning${dim}`}
                    d={segment(x, allTop, bar, Math.max(0, freshTop - allTop - (fresh > 0 ? GAP : 0)), true)} />
                )}
                {i % every === 0 && (
                  <text x={LEFT + (i + 0.5) * column} y={HEIGHT - 8} textAnchor="middle" className="ca-tick">
                    {(total - row.end).toLocaleString()}
                  </text>
                )}
                <rect
                  x={LEFT + i * column} y={TOP} width={column} height={plot} className="ca-hit" tabIndex={0} role="button"
                  aria-label={`${label(row)}: ${plural(row.items, 'item')}, ${plural(fresh, 'item')} from ${plural(row.newCreators, 'new creator')}`}
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
            <strong>{label(hover)}</strong>
            <span><span className="ca-swatch ca-swatch-new" />{plural(hover.newCreatorItems, 'item')} from {plural(hover.newCreators, 'new creator')}</span>
            <span><span className="ca-swatch ca-swatch-returning" />{plural(hover.items - hover.newCreatorItems, 'item')} from returning creators</span>
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
