import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { Point } from '../lib/portfolio';

export type ChartMarker = { time: string; color: string; id: string; size?: number };
export type HoverPoint = { time: string; value: number } | null;

type Props = {
  points: Point[];
  intraday: boolean;
  height: number;
  markers?: ChartMarker[];
  axes?: boolean;
  onHover?: (p: HoverPoint) => void;
  onMarkerClick?: (id: string) => void;
  label: string;
};

const UP = '#3ccf7e';
const DOWN = '#ff5d5d';

function toTime(t: string, intraday: boolean): Time {
  return (intraday ? Math.floor(Date.parse(t) / 1000) : t.slice(0, 10)) as Time;
}

/** navigator.language can be a non-BCP-47 tag in some environments; Intl would throw. */
function safeLocale(): string {
  const l = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  try {
    new Intl.NumberFormat(l);
    return l;
  } catch {
    return 'en-US';
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Snap marker times to the closest data point at or before them (markers need existing bars). */
export function snapMarkers(points: Point[], markers: ChartMarker[], intraday: boolean): SeriesMarker<Time>[] {
  if (points.length === 0) return [];
  const times = points.map((p) => (intraday ? Date.parse(p[0]) : Date.parse(p[0].slice(0, 10) + 'T23:59:59Z')));
  const first = times[0];
  const out: SeriesMarker<Time>[] = [];
  const seen = new Set<string>();
  for (const m of markers) {
    const mt = Date.parse(m.time);
    if (Number.isNaN(mt) || mt < first - 86_400_000) continue;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= mt) lo = mid;
      else hi = mid - 1;
    }
    const p = points[lo];
    const key = `${p[0]}:${m.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ time: toTime(p[0], intraday), position: 'atPriceMiddle', price: p[1], shape: 'circle', color: m.color, id: m.id, size: m.size ?? 0.9 });
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export function PriceChart({ points, intraday, height, markers, axes = false, onHover, onMarkerClick, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Area'> | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const baseLine = useRef<IPriceLine | null>(null);
  const hoverRef = useRef(onHover);
  const clickRef = useRef(onMarkerClick);
  hoverRef.current = onHover;
  clickRef.current = onMarkerClick;

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#66666e',
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: axes, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      leftPriceScale: { visible: false },
      timeScale: { visible: axes, borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(255,255,255,0.22)', width: 1, style: LineStyle.Solid, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
      localization: { locale: safeLocale(), priceFormatter: (p: number) => p.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    });
    const s = c.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderWidth: 0,
    });
    chart.current = c;
    series.current = s;
    markerApi.current = createSeriesMarkers(s, []);
    c.subscribeCrosshairMove((param) => {
      const cb = hoverRef.current;
      if (!cb) return;
      const d = param.time !== undefined ? param.seriesData.get(s) : undefined;
      const value = d && 'value' in d ? (d.value as number) : null;
      if (!d || value == null) {
        cb(null);
        return;
      }
      const t = typeof d.time === 'number' ? new Date(d.time * 1000).toISOString() : String(d.time);
      cb({ time: t, value });
    });
    c.subscribeClick((param) => {
      if (param.hoveredObjectId != null && clickRef.current) clickRef.current(String(param.hoveredObjectId));
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      markerApi.current = null;
      baseLine.current = null;
    };
  }, [axes]);

  useEffect(() => {
    const s = series.current;
    const c = chart.current;
    if (!s || !c) return;
    const data = points.map(([t, v]) => ({ time: toTime(t, intraday), value: v }));
    const dedup = data.filter((d, i) => i === 0 || d.time !== data[i - 1].time);
    const rising = points.length < 2 || points[points.length - 1][1] >= points[0][1];
    const color = rising ? UP : DOWN;
    s.applyOptions({
      lineColor: color,
      topColor: hexA(color, 0.2),
      bottomColor: hexA(color, 0),
      crosshairMarkerBackgroundColor: color,
    });
    s.setData(dedup);
    if (baseLine.current) s.removePriceLine(baseLine.current);
    baseLine.current =
      points.length > 1
        ? s.createPriceLine({
            price: points[0][1],
            color: 'rgba(255,255,255,0.18)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: '',
          })
        : null;
    markerApi.current?.setMarkers(markers ? snapMarkers(points, markers, intraday) : []);
    c.applyOptions({
      timeScale: { timeVisible: intraday, secondsVisible: false },
    });
    c.timeScale().fitContent();
  }, [points, intraday, markers]);

  return (
    <div className="chart" style={{ height }} role="img" aria-label={label} onMouseLeave={() => hoverRef.current?.(null)}>
      <div ref={el} className="chart-canvas" />
    </div>
  );
}
