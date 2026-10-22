import { useCallback, useEffect, useRef, useState } from 'react';
import { IconRefresh, IconSend } from '../components/Icons';
import { TopBar } from '../components/Layout';
import { buildAskContext, systemPrompt } from '../lib/askContext';
import { Markdown } from '../lib/markdown';
import { ollamaChat, ollamaModels, type ChatMessage } from '../lib/ollama';
import { useApp, useLocal } from '../state/AppContext';

type Status = { kind: 'checking' } | { kind: 'ok'; models: string[] } | { kind: 'offline'; reason: string };

const SUGGESTIONS = [
  'Why did my biggest loser drop this week?',
  'Which holdings need my attention?',
  'Summarise the news for my ETFs',
  'Is my portfolio too concentrated?',
];

export function AskScreen() {
  const local = useLocal();
  const { feed, updateLocal } = useApp();
  const { ollamaUrl, ollamaModel } = local.prefs;
  const [status, setStatus] = useState<Status>({ kind: 'checking' });
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    setStatus({ kind: 'checking' });
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 2500);
    try {
      setStatus({ kind: 'ok', models: await ollamaModels(ollamaUrl, ctl.signal) });
    } catch (e) {
      setStatus({ kind: 'offline', reason: e instanceof Error && e.name !== 'AbortError' ? e.message : 'No response' });
    } finally {
      window.clearTimeout(t);
    }
  }, [ollamaUrl]);

  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null);
    setInput('');
    const history: ChatMessage[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const sys: ChatMessage = { role: 'system', content: systemPrompt(buildAskContext(local.config, feed)) };
      await ollamaChat(
        ollamaUrl,
        ollamaModel,
        [sys, ...history],
        (tok) =>
          setMsgs((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + tok };
            return copy;
          }),
        ctl.signal,
      );
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const models = status.kind === 'ok' ? status.models : [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="ask">
      <TopBar
        title="Ask"
        sub={status.kind === 'ok' ? `Local model · ${ollamaModel}` : 'Local model'}
        actions={
          <button type="button" className="icon-btn" aria-label="Check connection again" onClick={() => void check()}>
            <IconRefresh className={status.kind === 'checking' ? 'spin' : undefined} />
          </button>
        }
      />
      <div className="page ask-page">
        {status.kind === 'offline' ? (
          <div className="ask-offline fade-in">
            <h2>Ollama is not reachable</h2>
            <p className="muted">
              Ask runs entirely on this device with <strong>Ollama</strong> — your questions and portfolio never leave it. It works only on a computer where
              Ollama runs and allows this app’s origin.
            </p>
            <ol className="steps">
              <li>
                Install Ollama and pull a model: <code className="code">ollama pull {ollamaModel}</code>
              </li>
              <li>
                Allow this app’s origin by setting <code className="code">OLLAMA_ORIGINS={origin}</code>, then restart Ollama:
                <pre className="code-block">{`# macOS
launchctl setenv OLLAMA_ORIGINS "${origin}"

# Linux (systemd): systemctl edit ollama
[Service]
Environment="OLLAMA_ORIGINS=${origin}"

# Windows (PowerShell)
setx OLLAMA_ORIGINS "${origin}"`}</pre>
              </li>
              <li>
                Keep the default URL <code className="code">{ollamaUrl}</code> or change it in Settings.
              </li>
            </ol>
            <p className="faint small">Last check: {status.reason}</p>
          </div>
        ) : (
          <>
            {msgs.length === 0 ? (
              <div className="ask-intro">
                <p className="muted">Questions are answered by a model on this device using your decrypted portfolio, current signals and recent events.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="suggestion" onClick={() => void send(s)} disabled={status.kind !== 'ok'}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="chat" aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <Markdown source={m.content} />
                    ) : (
                      <span className="typing" aria-label="Thinking" />
                    )
                  ) : (
                    <p>{m.content}</p>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {err ? <p className="notice error">{err}</p> : null}
          </>
        )}
      </div>
      {status.kind !== 'offline' ? (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          {models.length > 1 ? (
            <select aria-label="Model" value={ollamaModel} onChange={(e) => updateLocal((l) => ({ ...l, prefs: { ...l.prefs, ollamaModel: e.target.value } }))}>
              {(models.includes(ollamaModel) ? models : [ollamaModel, ...models]).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : null}
          <input
            aria-label="Your question"
            placeholder="Why did … drop today?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status.kind !== 'ok'}
          />
          {busy ? (
            <button type="button" className="btn secondary small" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="icon-btn send" aria-label="Send" disabled={!input.trim() || status.kind !== 'ok'}>
              <IconSend />
            </button>
          )}
        </form>
      ) : null}
    </div>
  );
}
