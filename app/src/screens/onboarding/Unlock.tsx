import { useState } from 'react';
import { Monogram } from '../../components/Icons';
import { useApp } from '../../state/AppContext';

export function UnlockScreen() {
  const { unlock, wipe } = useApp();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!pass) return;
    setBusy(true);
    setErr(null);
    try {
      await unlock(pass);
    } catch (e) {
      setErr(e instanceof Error && e.name === 'DecryptError' ? 'Wrong passphrase.' : e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="gate fade-in">
      <form
        className="gate-inner"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Monogram size={44} />
        <h1>Unlock Arbitrage</h1>
        <p className="muted">Your data is encrypted on this device. Enter your passphrase to decrypt it.</p>
        <label className="field">
          <span className="label">Passphrase</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus autoComplete="current-password" aria-invalid={!!err} />
        </label>
        {err ? (
          <p className="notice error" role="alert">
            {err}
          </p>
        ) : null}
        <button type="submit" className="btn block" disabled={busy || !pass}>
          {busy ? 'Decrypting…' : 'Unlock'}
        </button>
        <button
          type="button"
          className="btn ghost forgot"
          onClick={() => {
            if (window.confirm('The passphrase cannot be recovered. Wipe this device and start over? Your repository is not changed.')) void wipe();
          }}
        >
          Forgot passphrase?
        </button>
      </form>
    </div>
  );
}
