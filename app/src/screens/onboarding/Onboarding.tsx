import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Monogram } from '../../components/Icons';
import { useApp } from '../../state/AppContext';
import { AddInstrumentForm } from '../add/AddInstrument';
import { GitHubForm } from '../settings/GitHubForm';
import { useNotificationControls } from '../settings/Notifications';
import { PassphraseInput } from './PassphraseInput';

const STEPS = ['Passphrase', 'Repository', 'Notifications', 'Holdings'];

export function Onboarding() {
  const { phase, local } = useApp();
  const [step, setStep] = useState(phase === 'welcome' ? 0 : 1);
  const effective = phase === 'welcome' ? 0 : Math.max(step, 1);

  return (
    <div className="onboarding">
      <header className="ob-head">
        <div className="ob-brand">
          <Monogram size={28} /> Arbitrage
        </div>
        <ol className="ob-progress" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i < effective ? 'done' : i === effective ? 'current' : ''} aria-current={i === effective ? 'step' : undefined}>
              <span className="bar" />
              <span className="lbl">{s}</span>
            </li>
          ))}
        </ol>
      </header>
      <main className="ob-body fade-in" key={effective}>
        {effective === 0 ? <StepPassphrase /> : null}
        {effective === 1 && local ? <StepGitHub onNext={() => setStep(2)} /> : null}
        {effective === 2 && local ? <StepPush onNext={() => setStep(3)} /> : null}
        {effective === 3 && local ? <StepHoldings /> : null}
      </main>
    </div>
  );
}

function StepPassphrase() {
  const { createVault } = useApp();
  const [pass, setPass] = useState({ v: '', ok: false });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pass.ok || !ack) return;
        setBusy(true);
        void createVault(pass.v).catch(() => setBusy(false));
      }}
    >
      <h1>Choose a passphrase</h1>
      <p className="lead">It encrypts everything — on this device and in your repository. Nothing is stored in plain text anywhere.</p>
      <PassphraseInput autoFocus onChange={(v, ok) => setPass({ v, ok })} />
      <div className="notice warn ob-note">
        <strong>It cannot be recovered.</strong> If you forget it, your encrypted data is lost. Store it in a password manager.
        <br />
        You will also add it to your repository as the Actions secret <code>ARB_PASSPHRASE</code> (Settings → Secrets and variables → Actions), so the watcher
        can read your configuration.
      </div>
      <label className="check">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have stored my passphrase safely
      </label>
      <div className="btn-row">
        <button type="submit" className="btn" disabled={!pass.ok || !ack || busy}>
          {busy ? 'Encrypting…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

function StepGitHub({ onNext }: { onNext: () => void }) {
  const { local } = useApp();
  return (
    <div>
      <h1>Connect your repository</h1>
      <p className="lead">
        The watcher runs in your own private GitHub repository. The app stores your encrypted configuration there and reads the encrypted feed the watcher
        writes.
      </p>
      <ul className="ob-facts">
        <li>
          Create a fine-grained token limited to <strong>only this repository</strong>.
        </li>
        <li>
          Grant exactly one permission: <strong>Contents → Read and write</strong>.
        </li>
        <li>The token is stored encrypted on this device and is never sent anywhere except api.github.com.</li>
      </ul>
      <GitHubForm initial={local?.github ?? null} submitLabel="Verify & connect" onDone={() => window.setTimeout(onNext, 900)} />
      <button type="button" className="btn ghost skip" onClick={onNext}>
        Skip for now — keep data on this device only
      </button>
    </div>
  );
}

function StepPush({ onNext }: { onNext: () => void }) {
  const n = useNotificationControls();
  return (
    <div>
      <h1>Get notified</h1>
      <p className="lead">
        The watcher sends a push notification when something important happens to your holdings. Notifications are end-to-end encrypted to this device.
      </p>
      <ul className="ob-facts">
        <li>A notification key pair is generated on this device and stored in your encrypted configuration.</li>
        <li>Quiet hours and the risk level can be changed later in Settings.</li>
        <li>On iPhone and iPad, add the app to the home screen first.</li>
      </ul>
      {n.msg ? <p className={`notice ${n.msg.tone}`}>{n.msg.text}</p> : null}
      <div className="btn-row">
        {n.enabled ? (
          <button type="button" className="btn" onClick={onNext}>
            Continue
          </button>
        ) : (
          <button type="button" className="btn" disabled={n.busy || !n.supported} onClick={() => void n.enable()}>
            {n.busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        )}
        {!n.enabled ? (
          <button type="button" className="btn ghost" onClick={onNext}>
            Skip
          </button>
        ) : null}
      </div>
      {!n.supported ? <p className="faint small">This browser does not support push notifications.</p> : null}
    </div>
  );
}

function StepHoldings() {
  const { local, updateLocal } = useApp();
  const nav = useNavigate();
  const added = [...(local?.config.holdings ?? []), ...(local?.config.candidates ?? [])];
  return (
    <div>
      <h1>Add your holdings</h1>
      <p className="lead">Search by name, ISIN or symbol. Add what you own, and anything you are considering. You can do this later too.</p>
      {added.length ? (
        <ul className="ob-added">
          {added.map((i) => (
            <li key={i.id}>
              <span className="dot tone-pos" /> {i.name}
            </li>
          ))}
        </ul>
      ) : null}
      <AddInstrumentForm />
      <div className="btn-row ob-finish">
        <button
          type="button"
          className="btn"
          onClick={() => {
            updateLocal((l) => ({ ...l, onboarded: true }));
            nav('/');
          }}
        >
          {added.length ? 'Finish' : 'Skip and finish'}
        </button>
      </div>
    </div>
  );
}
