import { useMemo, useState } from 'react';
import { PriceChart, type ChartMarker, type HoverPoint } from '../../components/PriceChart';
import { RangeChips } from '../../components/RangeChips';
import { useIsDesktop } from '../../components/useNow';
import { dateShort, dateTime, money, pct, tone } from '../../lib/format';
import { normaliseSeries, rangeChange, sliceRange, type Range } from '../../lib/portfolio';
import type { FeedEvent, InstrumentSnapshot } from '../../lib/types';

const MARKER_COLOR = { pos: '#3ccf7e', neg: '#ff5d5d', neutral: '#b9b9c0' };

export function eventColor(e: FeedEvent): string {
  return e.sentiment >= 0.2 ? MARKER_COLOR.pos : e.sentiment <= -0.2 ? MARKER_COLOR.neg : MARKER_COLOR.neutral;
}

export function InstrumentChart({ snap, currency, onEvent }: { snap: InstrumentSnapshot; currency: string; onEvent: (id: string) => void }) {
  const [range, setRange] = useState<Range>('6M');
  const [hover, setHover] = useState<HoverPoint>(null);
  const desktop = useIsDesktop();
  const daily = useMemo(() => normaliseSeries(snap.history.daily, 'daily'), [snap]);
  const intraday = useMemo(() => normaliseSeries(snap.history.intraday, 'intraday'), [snap]);
  const sliced = useMemo(() => sliceRange(daily, intraday, range), [daily, intraday, range]);
  const markers = useMemo<ChartMarker[]>(
    () =>
      snap.events
        .filter((e) => e.impact !== 'low' || e.kind === 'earnings')
        .map((e) => ({ id: e.id, time: e.time, color: eventColor(e), size: e.impact === 'high' ? 1.1 : 0.8 })),
    [snap],
  );
  const ch = rangeChange(sliced.points);

  return (
    <div className="inst-chart">
      <div className="inst-price">
        <div className="inst-price-v num">{money(hover ? hover.value : snap.price, currency)}</div>
        <div className="inst-price-c num">
          {hover ? (
            <span className="muted">{sliced.intraday ? dateTime(hover.time) : dateShort(hover.time)}</span>
          ) : (
            <>
              <span className={tone(snap.changePct1d)}>{pct(snap.changePct1d)}</span>
              <span className="faint"> today</span>
              {ch ? (
                <>
                  <span className="faint"> · </span>
                  <span className={tone(ch.pct)}>{pct(ch.pct)}</span>
                  <span className="faint"> {range}</span>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      {sliced.points.length > 1 ? (
        <PriceChart
          points={sliced.points}
          intraday={sliced.intraday}
          height={desktop ? 280 : 220}
          markers={markers}
          axes={desktop}
          onHover={setHover}
          onMarkerClick={onEvent}
          label={`Price chart, ${range}, with event markers`}
        />
      ) : (
        <div className="chart-placeholder">No price history yet.</div>
      )}
      <div className="chart-foot">
        <RangeChips value={range} onChange={setRange} />
        <div className="legend" aria-label="Marker legend">
          <span>
            <span className="dot tone-pos" /> positive
          </span>
          <span>
            <span className="dot tone-neg" /> negative
          </span>
          <span>
            <span className="dot tone-neutral" /> neutral
          </span>
        </div>
      </div>
    </div>
  );
}
