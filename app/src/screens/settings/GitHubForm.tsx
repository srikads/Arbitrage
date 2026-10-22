import { useState } from 'react';
import { Field } from '../../components/ui';
import type { GitHubConn } from '../../lib/config';
import { verifyRepo } from '../../lib/github';
import { useApp } from '../../state/AppContext';
import { pullConfig } from '../../state/remote';

/** Connect / re-connect the private repository. Verifies access before saving. */
export function GitHubForm({ initial, onDone, submitLabel = 'Connect' }: { initial: GitHubConn | null; onDone?: (msg: string) => void; submitLabel?: string }) {
  const { updateLocal, refresh, local } = useApp();
  const [repo, setRepo] = useState(initial ? `${initial.owner}/${initial.repo}` : '');
  const [token, setToken] = useState(initial?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);

  const submit = async () => {
    const m = /^\s*(?:https?:\/\/github\.com\/)?([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+?)(?:\.git)?\/?\s*$/.exec(repo);
    if (!m) return setMsg({ tone: 'error', text: 'Enter the repository as owner/name.' });
    if (!token.trim()) return setMsg({ tone: 'error', text: 'Enter your fine-grained access token.' });
    const conn: GitHubConn = { owner: m[1], repo: m[2], token: token.trim() };
    setBusy(true);
    setMsg(null);
    try {
      const info = await verifyRepo(conn);
      const remote = await pullConfig(conn).catch(() => null);
      let note = `Connected to ${info.fullName}.`;
      const localEmpty = !local || (local.config.holdings.length === 0 && local.config.candidates.length === 0);
      if (remote?.config && localEmpty && (remote.config.holdings.length || remote.config.candidates.length)) {
        const cfg = remote.config;
        updateLocal((l) => ({ ...l, github: conn, config: cfg, configSha: remote.sha, dirty: false }));
        note += ` Restored ${cfg.holdings.length} holdings and ${cfg.candidates.length} watched instruments from the repository.`;
      } else {
        updateLocal((l) => ({ ...l, github: conn, configSha: remote?.sha ?? null, dirty: true }));
        if (remote && !remote.config) note += ' An existing config in the repo could not be decrypted with this passphrase; it will be overwritten.';
      }
      setMsg({
        tone: info.private ? 'ok' : 'warn',
        text: info.private ? note : `${note} Warning: this repository is public. Data stays encrypted, but a private repository is strongly recommended.`,
      });
      void refresh();
      onDone?.(note);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="gh-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Repository" hint="The private repository that runs the watcher, e.g. jane/arbitrage">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repository"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
        />
      </Field>
      <Field
        label="Fine-grained access token"
        hint={
          <>
            Create at GitHub → Settings → Developer settings → Fine-grained tokens. <strong>Repository access:</strong> only this repository.{' '}
            <strong>Permissions:</strong> Contents → Read and write (nothing else). Stored encrypted on this device only.
          </>
        }
      >
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" spellCheck={false} />
      </Field>
      {msg ? <p className={`notice ${msg.tone}`}>{msg.text}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Checking…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
