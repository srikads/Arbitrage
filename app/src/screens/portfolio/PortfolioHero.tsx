import { useMemo, useState } from 'react';
import { PriceChart, type HoverPoint } from '../../components/PriceChart';
import { RangeChips } from '../../components/RangeChips';
import { useNow } from '../../components/useNow';
import { dateShort, dateTime, marketOpenNow, money, pct, signedMoney, timeAgo, tone } from '../../lib/format';
import { portfolioHistory, rangeChange, sliceRange, type PortfolioTotals, type Range } from '../../lib/portfolio';
import type { Feed, Position } from '../../lib/types';
import { useIsDesktop } from '../../components/useNow';

export function PortfolioHero({ totals, holdings, feed }: { totals: PortfolioTotals; holdings: Position[]; feed: Feed | null }) {
  const [range, setRange] = useState<Range>('1M');
  const [hover, setHover] = useState<HoverPoint>(null);
  const desktop = useIsDesktop();
  useNow(30_000);

  const daily = useMemo(() => portfolioHistory(holdings, feed, 'daily'), [holdings, feed]);
  const intraday = useMemo(() => portfolioHistory(holdings, feed, 'intraday'), [holdings, feed]);
  const sliced = useMemo(() => sliceRange(daily, intraday, range), [daily, intraday, range]);
  const ch = rangeChange(sliced.points);
  const open = marketOpenNow();

  const shownValue = hover ? hover.value : totals.value;
  const hoverChange = hover && sliced.points.length ? hover.value - sliced.points[0][1] : null;
  const hoverPct = hover && sliced.points.length && sliced.points[0][1] ? (hoverChange! / sliced.points[0][1]) * 100 : null;

  return (
    <div className="hero">
      <div className="hero-top">
        <div className="hero-label">{hover ? (sliced.intraday ? dateTime(hover.time) : dateShort(hover.time)) : 'Total value'}</div>
        <div className="hero-value num" aria-live="polite">
          {money(shownValue)}
        </div>
        {hover ? (
          <div className="hero-lines num">
            <span className={tone(hoverChange)}>
              {signedMoney(hoverChange)} ({pct(hoverPct)})
            </span>
            <span className="faint"> since {range === '1D' ? 'open' : `start of ${range}`}</span>
          </div>
        ) : (
          <div className="hero-lines num">
            <div>
              <span className={tone(totals.dayChange)}>
                {signedMoney(totals.dayChange)} ({pct(totals.dayPct)})
              </span>
              <span className="faint"> today</span>
            </div>
            <div>
              <span className={tone(totals.pnl)}>
                {signedMoney(totals.pnl)} ({pct(totals.pnlPct)})
              </span>
              <span className="faint"> total return</span>
            </div>
          </div>
        )}
        <div className="hero-meta">
          <span className={`mkt ${open ? 'open' : ''}`}>
            <span className="dot" aria-hidden="true" />
            {open ? 'Market open' : 'Market closed'}
          </span>
          <span className="faint">·</span>
          <span>{feed ? `Updated ${timeAgo(feed.generatedAt)}` : 'No market data yet'}</span>
        </div>
      </div>
      {sliced.points.length > 1 ? (
        <>
          <PriceChart
            points={sliced.points}
            intraday={sliced.intraday}
            height={desktop ? 260 : 200}
            onHover={setHover}
            label={`Value of current holdings, ${range}`}
          />
          <div className="chart-foot">
            <RangeChips value={range} onChange={setRange} />
            {ch ? (
              <span className={`range-change num ${tone(ch.abs)}`}>
                {pct(ch.pct)}
              </span>
            ) : null}
          </div>
          <p className="chart-note">Value of your current holdings over time (quantities as of today).</p>
        </>
      ) : (
        <div className="chart-placeholder">Chart appears once the watcher has delivered price history.</div>
      )}
    </div>
  );
}
