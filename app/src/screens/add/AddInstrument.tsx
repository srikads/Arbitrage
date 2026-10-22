import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TopBar } from '../../components/Layout';
import { Avatar, Field } from '../../components/ui';
import { useIsDesktop } from '../../components/useNow';
import { pickCandidate, pickPosition } from '../../lib/config';
import { isValidIsin, normaliseIsin } from '../../lib/isin';
import type { Candidate, Instrument, InstrumentType, Position } from '../../lib/types';
import { useApp, useLocal } from '../../state/AppContext';
import { InstrumentSearch } from './InstrumentSearch';
import { parseNum } from './parse';

export type AddKind = 'holding' | 'watch';

export function AddInstrumentForm({ initialKind = 'holding', onAdded, autoFocus }: { initialKind?: AddKind; onAdded?: (i: Instrument, kind: AddKind) => void; autoFocus?: boolean }) {
  const local = useLocal();
  const { updateConfig } = useApp();
  const [kind, setKind] = useState<AddKind>(initialKind);
  const [picked, setPicked] = useState<Instrument | null>(null);
  const [manual, setManual] = useState<{ isin: string; name: string; symbol: string; type: InstrumentType } | null>(null);
  const [f, setF] = useState({ quantity: '', buyPrice: '', buyDate: '', sl: '', tp: '', target: '', note: '' });
  const [err, setErr] = useState<string | null>(null);
  const cfg = local.config;
  const exclude = useMemo(() => new Set([...cfg.holdings, ...cfg.candidates].map((i) => i.id)), [cfg.holdings, cfg.candidates]);

  const reset = () => {
    setPicked(null);
    setManual(null);
    setF({ quantity: '', buyPrice: '', buyDate: '', sl: '', tp: '', target: '', note: '' });
    setErr(null);
  };

  const resolveInstrument = (): Instrument | string => {
    if (picked) return picked;
    if (!manual) return 'Pick an instrument first.';
    const isin = normaliseIsin(manual.isin);
    if (!isValidIsin(isin)) return 'Please enter a valid ISIN (check digit does not match).';
    if (!manual.name.trim()) return 'Please enter a name.';
    return {
      id: isin,
      isin,
      symbol: manual.symbol.trim().toUpperCase(),
      name: manual.name.trim(),
      type: manual.type,
      currency: 'EUR',
      aliases: [],
      wikipedia: null,
    };
  };

  const submit = () => {
    const inst = resolveInstrument();
    if (typeof inst === 'string') return setErr(inst);
    if (exclude.has(inst.id)) return setErr(`${inst.name} is already in your portfolio.`);
    if (kind === 'holding') {
      const q = parseNum(f.quantity);
      const b = parseNum(f.buyPrice);
      if (q == null || q <= 0) return setErr('Enter the quantity you hold.');
      if (b == null || b <= 0) return setErr('Enter your average buy price per unit.');
      const sl = f.sl.trim() ? parseNum(f.sl) : null;
      const tp = f.tp.trim() ? parseNum(f.tp) : null;
      if (sl != null && (sl <= 0 || sl >= 100)) return setErr('Stop-loss must be between 0 and 100 %.');
      if (tp != null && tp <= 0) return setErr('Take-profit must be greater than 0 %.');
      const pos: Position = pickPosition({ ...inst, quantity: q, buyPrice: b, buyDate: f.buyDate || null, stopLossPct: sl, takeProfitPct: tp });
      updateConfig((c) => ({ ...c, holdings: [...c.holdings, pos] }));
    } else {
      const t = f.target.trim() ? parseNum(f.target) : null;
      if (f.target.trim() && (t == null || t <= 0)) return setErr('Target price must be a positive number.');
      const cand: Candidate = pickCandidate({ ...inst, targetPrice: t, note: f.note.trim() });
      updateConfig((c) => ({ ...c, candidates: [...c.candidates, cand] }));
    }
    reset();
    onAdded?.(inst, kind);
  };

  const chosen = picked ?? null;
  const settings = cfg.settings;

  return (
    <div className="add-form">
      <div className="segmented" role="group" aria-label="Add as">
        <button type="button" aria-pressed={kind === 'holding'} onClick={() => setKind('holding')}>
          Holding
        </button>
        <button type="button" aria-pressed={kind === 'watch'} onClick={() => setKind('watch')}>
          Watching
        </button>
      </div>

      {!chosen && !manual ? (
        <InstrumentSearch exclude={exclude} autoFocus={autoFocus} onPick={(i) => (setPicked(i), setErr(null))} onManual={(isin) => setManual({ isin, name: '', symbol: '', type: 'stock' })} />
      ) : null}

      {chosen ? (
        <div className="picked">
          <Avatar symbol={chosen.symbol} name={chosen.name} />
          <div className="left">
            <div className="title">{chosen.name}</div>
            <div className="sub">
              {chosen.symbol} · {chosen.isin ?? '–'} · {chosen.type === 'etf' ? 'ETF' : 'Stock'}
            </div>
          </div>
          <button type="button" className="link" onClick={reset}>
            Change
          </button>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        hidden={!chosen && !manual}
      >
        {manual ? (
          <fieldset className="plain">
            <legend className="sublabel">Instrument not in the list</legend>
            <Field label="ISIN" error={manual.isin && !isValidIsin(manual.isin) ? 'Invalid ISIN (12 characters, check digit must match)' : null}>
              <input value={manual.isin} onChange={(e) => setManual({ ...manual, isin: e.target.value.toUpperCase() })} aria-invalid={!!manual.isin && !isValidIsin(manual.isin)} maxLength={14} autoFocus spellCheck={false} />
            </Field>
            <Field label="Name">
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            </Field>
            <div className="field-row">
              <Field label="Symbol (optional)" hint="e.g. SIE.DE — otherwise resolved by the watcher">
                <input value={manual.symbol} onChange={(e) => setManual({ ...manual, symbol: e.target.value })} spellCheck={false} />
              </Field>
              <Field label="Type">
                <select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value as InstrumentType })}>
                  <option value="stock">Stock</option>
                  <option value="etf">ETF</option>
                </select>
              </Field>
            </div>
            <button type="button" className="link back-to-search" onClick={reset}>
              Back to search
            </button>
          </fieldset>
        ) : null}

        {kind === 'holding' ? (
          <>
            <div className="field-row">
              <Field label="Quantity">
                <input inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required autoFocus={!manual} />
              </Field>
              <Field label="Avg. buy price (EUR)">
                <input inputMode="decimal" value={f.buyPrice} onChange={(e) => setF({ ...f, buyPrice: e.target.value })} required />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Stop-loss %" hint={`Optional · default ${settings.defaultStopLossPct} %`}>
                <input inputMode="decimal" value={f.sl} placeholder={String(settings.defaultStopLossPct)} onChange={(e) => setF({ ...f, sl: e.target.value })} />
              </Field>
              <Field label="Take-profit %" hint={`Optional · default ${settings.defaultTakeProfitPct} %`}>
                <input inputMode="decimal" value={f.tp} placeholder={String(settings.defaultTakeProfitPct)} onChange={(e) => setF({ ...f, tp: e.target.value })} />
              </Field>
            </div>
            <Field label="Buy date (optional)">
              <input type="date" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Target price (optional)" hint="You get a signal when the price falls to or below this level.">
              <input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} autoFocus={!manual} />
            </Field>
            <Field label="Note (optional)">
              <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
            </Field>
          </>
        )}
        {err ? <p className="notice error form-error">{err}</p> : null}
        <div className="btn-row">
          <button type="submit" className="btn">
            {kind === 'holding' ? 'Add holding' : 'Add to watch list'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AddInstrumentScreen() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const desktop = useIsDesktop();
  return (
    <div className="add-screen fade-in">
      <TopBar title="Add instrument" back={desktop ? undefined : '/'} line />
      <div className="page">
        <AddInstrumentForm
          autoFocus
          initialKind={params.get('as') === 'watch' ? 'watch' : 'holding'}
          onAdded={(i) => nav(`/i/${encodeURIComponent(i.id)}`)}
        />
      </div>
    </div>
  );
}
