import { useRef, useState } from 'react';
import { Field, Section } from '../../components/ui';
import { downloadJson, makeBackup, parseBackup } from '../../lib/backup';
import { decrypt, isEnvelope } from '../../lib/crypto';
import type { Envelope } from '../../lib/types';
import { useApp, useLocal } from '../../state/AppContext';
import { ring } from '../../state/vault';
import { PassphraseInput } from '../onboarding/PassphraseInput';
import { SettingRow } from './Settings';

const LOCK_OPTIONS = [1, 5, 10, 15, 30, 60, 0];

export function SecuritySettings() {
  const local = useLocal();
  const { updateLocal, lock, changePassphrase, replaceLocal, wipe, demo } = useApp();
  const [pw, setPw] = useState({ cur: '', next: '', ok: false });
  const [pwMsg, setPwMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importEnv, setImportEnv] = useState<Envelope | null>(null);
  const [importPass, setImportPass] = useState('');
  const [bkMsg, setBkMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doChange = async () => {
    setBusy(true);
    setPwMsg(null);
    try {
      await changePassphrase(pw.cur, pw.next);
      setPw({ cur: '', next: '', ok: false });
      setPwMsg({
        tone: 'ok',
        text: 'Passphrase changed and data re-encrypted. Now update the repository secret ARB_PASSPHRASE to the new passphrase — until then the watcher cannot read your config.',
      });
    } catch (e) {
      setPwMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    const env = await ring().encryptFresh(JSON.stringify(makeBackup(local)));
    downloadJson(`arbitrage-backup-${new Date().toISOString().slice(0, 10)}.json`, env);
    setBkMsg({ tone: 'ok', text: 'Backup downloaded. It is encrypted with your current passphrase and does not contain your GitHub token.' });
  };

  const restore = async (env: Envelope, passphrase: string | null) => {
    try {
      const text = passphrase == null ? await ring().decrypt(env) : await decrypt(passphrase, env);
      const b = parseBackup(JSON.parse(text));
      if (
        !window.confirm(
          `Replace your current holdings and settings with this backup (${b.config.holdings.length} holdings, ${b.config.candidates.length} watched)?`,
        )
      )
        return;
      await replaceLocal({ ...local, config: b.config, prefs: { ...local.prefs, ...b.prefs } });
      setImportEnv(null);
      setImportPass('');
      setBkMsg({ tone: 'ok', text: 'Backup restored.' });
    } catch (e) {
      if (passphrase == null && e instanceof Error && e.name === 'DecryptError') {
        setImportEnv(env);
        setBkMsg({ tone: 'error', text: 'This backup uses a different passphrase. Enter it below.' });
      } else
        setBkMsg({
          tone: 'error',
          text: e instanceof Error && e.name !== 'DecryptError' && !(e instanceof SyntaxError) ? e.message : 'Wrong passphrase or damaged backup.',
        });
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBkMsg(null);
    try {
      const env = JSON.parse(await f.text()) as unknown;
      if (!isEnvelope(env)) throw new Error('Not an encrypted backup file.');
      await restore(env, null);
    } catch (e) {
      setBkMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <Section title="Security" id="security">
        <SettingRow label="Auto-lock" hint="Lock after this much inactivity; the key is then removed from memory" htmlFor="autolock">
          <select
            id="autolock"
            className="input"
            value={local.prefs.autoLockMin}
            onChange={(e) => updateLocal((l) => ({ ...l, prefs: { ...l.prefs, autoLockMin: Number(e.target.value) } }))}
          >
            {LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Never' : `${m} min`}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Lock now">
          <button type="button" className="btn secondary small" onClick={lock} disabled={demo}>
            Lock
          </button>
        </SettingRow>
        <details className="set-details">
          <summary>Change passphrase</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doChange();
            }}
          >
            <Field label="Current passphrase">
              <input type="password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} autoComplete="current-password" />
            </Field>
            <PassphraseInput onChange={(next, ok) => setPw((p) => ({ ...p, next, ok }))} />
            <p className="notice warn">
              After changing it, set the repository secret <code>ARB_PASSPHRASE</code> to the new passphrase.
            </p>
            {pwMsg ? <p className={`notice ${pwMsg.tone}`}>{pwMsg.text}</p> : null}
            <div className="btn-row">
              <button type="submit" className="btn" disabled={busy || !pw.ok || !pw.cur || demo}>
                {busy ? 'Re-encrypting…' : 'Change passphrase'}
              </button>
            </div>
          </form>
        </details>
      </Section>

      <Section title="Backup" id="backup">
        <SettingRow label="Export encrypted backup" hint="Holdings, watch list and settings as an encrypted file">
          <button type="button" className="btn secondary small" onClick={() => void exportBackup()} disabled={demo}>
            Export
          </button>
        </SettingRow>
        <SettingRow label="Import backup" hint="Replaces holdings, watch list and settings">
          <button type="button" className="btn secondary small" onClick={() => fileRef.current?.click()} disabled={demo}>
            Import…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </SettingRow>
        {importEnv ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void restore(importEnv, importPass);
            }}
          >
            <Field label="Backup passphrase">
              <input type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} autoFocus />
            </Field>
            <div className="btn-row">
              <button type="submit" className="btn small">
                Decrypt & restore
              </button>
            </div>
          </form>
        ) : null}
        {bkMsg ? <p className={`notice ${bkMsg.tone}`}>{bkMsg.text}</p> : null}
      </Section>

      <Section title="Danger zone" id="danger">
        <SettingRow label="Wipe all local data" hint="Deletes everything stored on this device. Your repository is not touched.">
          <button
            type="button"
            className="btn danger small"
            disabled={demo}
            onClick={() => {
              if (window.confirm('Delete all data on this device? You will need your passphrase (and repository) to restore.')) void wipe();
            }}
          >
            Wipe
          </button>
        </SettingRow>
      </Section>
    </>
  );
}
