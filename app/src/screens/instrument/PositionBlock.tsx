import { useState } from 'react';
import { Field, Section } from '../../components/ui';
import { dateShort, money, num, pct, signedMoney, tone } from '../../lib/format';
import type { PositionView } from '../../lib/portfolio';
import type { Candidate, InstrumentSnapshot, Position, Settings } from '../../lib/types';
import { distanceToTarget } from '../../lib/portfolio';
import { parseNum } from '../add/parse';

export function PositionBlock({ v, settings, onSave }: { v: PositionView; settings: Settings; onSave: (p: Position) => void }) {
  const p = v.pos;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(() => formOf(p));
  const [err, setErr] = useState<string | null>(null);
  const cur = p.currency;
  const slPct = p.stopLossPct ?? settings.defaultStopLossPct;
  const tpPct = p.takeProfitPct ?? settings.defaultTakeProfitPct;

  const save = () => {
    const q = parseNum(f.quantity);
    const b = parseNum(f.buyPrice);
    if (q == null || q <= 0) return setErr('Quantity must be greater than 0.');
    if (b == null || b <= 0) return setErr('Buy price must be greater than 0.');
    const sl = f.sl.trim() ? parseNum(f.sl) : null;
    const tp = f.tp.trim() ? parseNum(f.tp) : null;
    if (sl != null && (sl <= 0 || sl >= 100)) return setErr('Stop-loss must be between 0 and 100 %.');
    if (tp != null && tp <= 0) return setErr('Take-profit must be greater than 0 %.');
    onSave({ ...p, quantity: q, buyPrice: b, buyDate: f.buyDate || null, stopLossPct: sl, takeProfitPct: tp });
    setErr(null);
    setEdit(false);
  };

  return (
    <Section
      title="Your position"
      aside={
        <button type="button" className="link" onClick={() => (edit ? (setEdit(false), setF(formOf(p)), setErr(null)) : setEdit(true))}>
          {edit ? 'Cancel' : 'Edit'}
        </button>
      }
    >
      {!edit ? (
        <dl className="kv-grid">
          <div>
            <dt>Quantity</dt>
            <dd className="num">{num(p.quantity, 4)}</dd>
          </div>
          <div>
            <dt>Buy price</dt>
            <dd className="num">{money(p.buyPrice, cur)}</dd>
            {p.buyDate ? <dd className="kv-sub">{dateShort(p.buyDate)}</dd> : null}
          </div>
          <div>
            <dt>Value</dt>
            <dd className="num">{money(v.value, cur)}</dd>
            <dd className="kv-sub num">cost {money(v.cost, cur)}</dd>
          </div>
          <div>
            <dt>Return</dt>
            <dd className={`num ${tone(v.pnl)}`}>{signedMoney(v.pnl, cur)}</dd>
            <dd className={`kv-sub num ${tone(v.pnlPct)}`}>{pct(v.pnlPct)}</dd>
          </div>
          <div>
            <dt>Stop-loss</dt>
            <dd className="num">{money(v.stopLevel, cur)}</dd>
            <dd className="kv-sub num">
              −{num(slPct, 1)} %{p.stopLossPct == null ? ' · default' : ''}
            </dd>
          </div>
          <div>
            <dt>Take-profit</dt>
            <dd className="num">{money(v.takeLevel, cur)}</dd>
            <dd className="kv-sub num">
              +{num(tpPct, 1)} %{p.takeProfitPct == null ? ' · default' : ''}
            </dd>
          </div>
        </dl>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="field-row">
            <Field label="Quantity">
              <input inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            </Field>
            <Field label={`Avg. buy price (${cur})`}>
              <input inputMode="decimal" value={f.buyPrice} onChange={(e) => setF({ ...f, buyPrice: e.target.value })} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Stop-loss %" hint={`Empty = default ${settings.defaultStopLossPct} %`}>
              <input inputMode="decimal" value={f.sl} placeholder={String(settings.defaultStopLossPct)} onChange={(e) => setF({ ...f, sl: e.target.value })} />
            </Field>
            <Field label="Take-profit %" hint={`Empty = default ${settings.defaultTakeProfitPct} %`}>
              <input inputMode="decimal" value={f.tp} placeholder={String(settings.defaultTakeProfitPct)} onChange={(e) => setF({ ...f, tp: e.target.value })} />
            </Field>
          </div>
          <Field label="Buy date (optional)">
            <input type="date" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} />
          </Field>
          {err ? <p className="notice error form-error">{err}</p> : null}
          <div className="btn-row">
            <button type="submit" className="btn">
              Save
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

function formOf(p: Position) {
  return {
    quantity: String(p.quantity),
    buyPrice: String(p.buyPrice),
    buyDate: p.buyDate ?? '',
    sl: p.stopLossPct != null ? String(p.stopLossPct) : '',
    tp: p.takeProfitPct != null ? String(p.takeProfitPct) : '',
  };
}

export function WatchBlock({ c, snap, onSave }: { c: Candidate; snap: InstrumentSnapshot | null; onSave: (c: Candidate) => void }) {
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState(c.targetPrice != null ? String(c.targetPrice) : '');
  const [note, setNote] = useState(c.note);
  const dist = distanceToTarget(c, snap?.price ?? null);
  return (
    <Section title="Watching" aside={<button type="button" className="link" onClick={() => setEdit(!edit)}>{edit ? 'Cancel' : 'Edit'}</button>}>
      {!edit ? (
        <dl className="kv-grid">
          <div>
            <dt>Target price</dt>
            <dd className="num">{c.targetPrice != null ? money(c.targetPrice, c.currency) : '–'}</dd>
            {dist != null ? <dd className="kv-sub num">{pct(dist, 1)} from current</dd> : null}
          </div>
          <div className="span-2">
            <dt>Note</dt>
            <dd>{c.note || <span className="faint">–</span>}</dd>
          </div>
        </dl>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = target.trim() ? parseNum(target) : null;
            onSave({ ...c, targetPrice: t != null && t > 0 ? t : null, note: note.trim() });
            setEdit(false);
          }}
        >
          <Field label={`Target price (${c.currency})`} hint="You get a signal when the price falls to or below this level.">
            <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="btn-row">
            <button type="submit" className="btn">
              Save
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}
