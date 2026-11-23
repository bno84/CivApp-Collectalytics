// SPDX-License-Identifier: AGPL-3.0-or-later
import { Card } from '@civitai/blocks-react/ui';

import { SectionTitle } from './common.js';

// A fixed, made-up shape for the faded placeholder. It is decoration only.
const MOCK = [3, 5, 2, 0, 4, 7, 6, 2, 1, 0, 3, 8, 5, 4, 2, 6, 9, 4, 3, 0, 2, 5, 7, 3, 1, 4, 6, 8, 5, 3];

/**
 * Discovery's items-per-day chart, waiting on Civitai: the app API gives the
 * order items were added in, but not when. Until it does, a faded mock stands
 * in, so the space and the intent are visible without inventing data.
 */
export function AdditionsChart() {
  const max = Math.max(...MOCK);
  return (
    <Card className="ca-card">
      <SectionTitle>Additions per day</SectionTitle>
      <div className="ca-pending">
        <svg className="ca-pending-chart" viewBox={`0 0 ${MOCK.length * 10} 100`} preserveAspectRatio="none" aria-hidden="true">
          {MOCK.map((value, i) => (
            <rect key={i} x={i * 10 + 2} y={100 - (value / max) * 92} width={6} height={(value / max) * 92} rx={1.5} />
          ))}
        </svg>
        <div className="ca-pending-note">
          <span className="ca-tag">Waiting on Civitai</span>
          <p>Civitai doesn't yet tell apps when each item was added, so this chart can't be drawn.</p>
        </div>
      </div>
    </Card>
  );
}
