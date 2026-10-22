import { useState } from 'react';
import { Field } from '../../components/ui';
import { MIN_PASSPHRASE_LENGTH, passphraseStrength } from '../../lib/strength';

/** New passphrase + confirmation with a strength hint. Reports (value, acceptable). */
export function PassphraseInput({ onChange, autoFocus }: { onChange: (value: string, ok: boolean) => void; autoFocus?: boolean }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [show, setShow] = useState(false);
  const st = passphraseStrength(a);
  const longEnough = a.length >= MIN_PASSPHRASE_LENGTH;
  const match = a === b;
  const emit = (x: string, y: string) => {
    const s = passphraseStrength(x);
    onChange(x, x.length >= MIN_PASSPHRASE_LENGTH && x === y && s.score >= 2);
  };
  return (
    <>
      <Field label="New passphrase" hint={`At least ${MIN_PASSPHRASE_LENGTH} characters. Four or more random words work well.`}>
        <input
          type={show ? 'text' : 'password'}
          value={a}
          autoFocus={autoFocus}
          autoComplete="new-password"
          onChange={(e) => {
            setA(e.target.value);
            emit(e.target.value, b);
          }}
        />
      </Field>
      {a ? (
        <div className={`strength s${st.score}`} aria-live="polite">
          <span className="strength-bar" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < Math.max(1, st.score) ? 'on' : ''} />
            ))}
          </span>
          <span>
            {st.label}
            {!longEnough ? ' · too short' : st.score < 2 ? ' · add more words or characters' : ''}
          </span>
        </div>
      ) : null}
      <Field label="Repeat passphrase" error={b && !match ? 'Passphrases do not match' : null}>
        <input
          type={show ? 'text' : 'password'}
          value={b}
          autoComplete="new-password"
          aria-invalid={!!b && !match}
          onChange={(e) => {
            setB(e.target.value);
            emit(a, e.target.value);
          }}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passphrase
      </label>
    </>
  );
}
