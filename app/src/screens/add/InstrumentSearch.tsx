import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { IconSearch } from '../../components/Icons';
import { Avatar } from '../../components/ui';
import { loadInstruments } from '../../lib/instruments';
import { isValidIsin, looksLikeIsin, normaliseIsin } from '../../lib/isin';
import { search, type SearchIndex } from '../../lib/search';
import type { Instrument } from '../../lib/types';

type Props = {
  onPick: (i: Instrument) => void;
  onManual: (isin: string) => void;
  exclude: Set<string>;
  autoFocus?: boolean;
};

export function InstrumentSearch({ onPick, onManual, exclude, autoFocus }: Props) {
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    loadInstruments()
      .then((r) => setIndex(r.index))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the instrument list'));
  }, []);

  const results = useMemo(() => (index ? search(index, q, 40) : []), [index, q]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const isinQuery = looksLikeIsin(q) ? normaliseIsin(q) : null;
  const isinValid = isinQuery ? isValidIsin(isinQuery) : false;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r && !exclude.has(r.id)) onPick(r);
      else if (isinValid && results.length === 0) onManual(isinQuery!);
    }
  };

  return (
    <div className="search">
      <div className="search-box">
        <IconSearch aria-hidden="true" />
        <input
          type="search"
          autoFocus={autoFocus}
          placeholder="Name, ISIN or symbol"
          aria-label="Search instruments"
          aria-controls="search-results"
          aria-activedescendant={results[active] ? `sr-${active}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      {q && index ? (
        <ul className="rows search-results" id="search-results" role="listbox" ref={listRef}>
          {results.map((r, i) => {
            const taken = exclude.has(r.id);
            return (
              <li key={r.id} role="option" id={`sr-${i}`} aria-selected={i === active} data-i={i}>
                <button
                  type="button"
                  className={`row${i === active ? ' selected' : ''}`}
                  disabled={taken}
                  onClick={() => onPick(r)}
                  onMouseEnter={() => setActive(i)}
                >
                  <Avatar symbol={r.symbol} name={r.name} />
                  <div className="left">
                    <div className="title">{r.name}</div>
                    <div className="sub">
                      <span>{r.symbol}</span>
                      <span className="sep">·</span>
                      <span className="num">{r.isin ?? '–'}</span>
                    </div>
                  </div>
                  <div className="right">
                    <span className={`type-tag ${r.type}`}>{taken ? 'Added' : r.type === 'etf' ? 'ETF' : 'Stock'}</span>
                  </div>
                </button>
              </li>
            );
          })}
          {results.length === 0 ? (
            <li className="row-empty">
              {isinQuery ? (
                isinValid ? (
                  <>
                    <strong>{isinQuery}</strong> is not in the offline list.{' '}
                    <button type="button" className="link" onClick={() => onManual(isinQuery)}>
                      Add it by ISIN
                    </button>
                  </>
                ) : (
                  <span className="down">This ISIN has an invalid check digit.</span>
                )
              ) : (
                <>No matches. Try the ISIN, or add an instrument manually.</>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="search-foot">
        <button type="button" className="link" onClick={() => onManual(isinValid ? isinQuery! : '')}>
          Add by ISIN not in the list
        </button>
      </div>
    </div>
  );
}
