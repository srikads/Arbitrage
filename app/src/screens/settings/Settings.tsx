import { useState, type ReactNode } from 'react';
import { TopBar } from '../../components/Layout';
import { Section, Switch } from '../../components/ui';
import { dateTime } from '../../lib/format';
import type { Settings } from '../../lib/types';
import { useApp, useLocal } from '../../state/AppContext';
import { parseNum } from '../add/parse';
import { GitHubForm } from './GitHubForm';
import { useNotificationControls } from './Notifications';
import { SecuritySettings } from './SecuritySettings';

export function SettingRow({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="set-row">
      <div className="set-text">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="set-label">{label}</span>}
        {hint ? <span className="set-hint">{hint}</span> : null}
      </div>
      {children ? <div className="set-ctl">{children}</div> : null}
    </div>
  );
}

function NumberSetting({ id, value, onChange, suffix, min, max }: { id: string; value: number; onChange: (v: number) => void; suffix: string; min: number; max: number }) {
  const [v, setV] = useState(String(value));
  return (
    <span className="input-suffix small-input">
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = parseNum(v);
          if (n != null && n >= min && n <= max) onChange(n);
          else setV(String(value));
        }}
      />
      <span>{suffix}</span>
    </span>
  );
}

const riskLabel = (r: number) => (r < 0.2 ? 'Conservative' : r < 0.45 ? 'Mostly conservative' : r < 0.7 ? 'Moderate' : 'Balanced');

export function SettingsScreen() {
  const local = useLocal();
  const { updateConfig, updateLocal, sync, syncError, syncNow, demo, feed } = useApp();
  const s = local.config.settings;
  const set = (fn: (s: Settings) => Settings) => updateConfig((c) => ({ ...c, settings: fn(c.settings) }));
  const n = useNotificationControls();
  const [editGh, setEditGh] = useState(!local.github);

  return (
    <div className="settings">
      <TopBar title="Settings" />
      <div className="page page-narrow">
        <p className="notice about-note">
          <strong>This app never connects to your bank or broker.</strong> It only talks to your own GitHub repository, your device’s push service and, if you
          use Ask, Ollama on this computer. Suggestions are automated research, <strong>not financial advice</strong>.
        </p>

        <Section title="Signals">
          <div className="set-row column">
            <div className="set-text">
              <label htmlFor="risk">Risk profile</label>
              <span className="set-hint">How eagerly the watcher suggests action. Conservative favours holding and only flags strong evidence.</span>
            </div>
            <input id="risk" type="range" min={0} max={1} step={0.05} value={s.risk} onChange={(e) => set((x) => ({ ...x, risk: Number(e.target.value) }))} aria-valuetext={riskLabel(s.risk)} />
            <div className="range-labels">
              <span>Conservative</span>
              <strong>{riskLabel(s.risk)}</strong>
              <span>Balanced</span>
            </div>
          </div>
          <SettingRow label="Default stop-loss" hint="Alert when a holding falls this far below your buy price" htmlFor="sl">
            <NumberSetting id="sl" value={s.defaultStopLossPct} suffix="%" min={1} max={95} onChange={(v) => set((x) => ({ ...x, defaultStopLossPct: v }))} />
          </SettingRow>
          <SettingRow label="Default take-profit" hint="Alert when a holding rises this far above your buy price" htmlFor="tp">
            <NumberSetting id="tp" value={s.defaultTakeProfitPct} suffix="%" min={1} max={1000} onChange={(v) => set((x) => ({ ...x, defaultTakeProfitPct: v }))} />
          </SettingRow>
          <SettingRow label="Quiet hours" hint={`No notifications in this window (${s.timezone}); critical alerts wait until it ends`}>
            <span className="time-range">
              <input className="input" type="time" aria-label="Quiet hours start" value={s.quietHours.start} onChange={(e) => set((x) => ({ ...x, quietHours: { ...x.quietHours, start: e.target.value } }))} />
              <span className="faint">–</span>
              <input className="input" type="time" aria-label="Quiet hours end" value={s.quietHours.end} onChange={(e) => set((x) => ({ ...x, quietHours: { ...x.quietHours, end: e.target.value } }))} />
            </span>
          </SettingRow>
        </Section>

        <Section title="Sources">
          {(
            [
              ['news', 'News', 'Broad business RSS feeds, filtered on the watcher'],
              ['bluesky', 'Bluesky', 'Public posts, searched together with decoy instruments'],
              ['forums', 'Investor forums', 'Board-level “latest posts” pages only'],
              ['wikipedia', 'Wikipedia attention', 'Page-view spikes as an attention signal'],
            ] as const
          ).map(([k, label, hint]) => (
            <SettingRow key={k} label={label} hint={hint}>
              <Switch label={label} checked={s.sources[k]} onChange={(v) => set((x) => ({ ...x, sources: { ...x.sources, [k]: v } }))} />
            </SettingRow>
          ))}
        </Section>

        <Section title="Digest">
          <SettingRow label="Daily digest" hint="Short summary after the market closes">
            <Switch label="Daily digest" checked={s.digest.daily} onChange={(v) => set((x) => ({ ...x, digest: { ...x.digest, daily: v } }))} />
          </SettingRow>
          <SettingRow label="Weekly review" hint="Saturday morning">
            <Switch label="Weekly review" checked={s.digest.weekly} onChange={(v) => set((x) => ({ ...x, digest: { ...x.digest, weekly: v } }))} />
          </SettingRow>
        </Section>

        <Section title="Notifications">
          <SettingRow label="Push notifications" hint={n.supported ? (n.enabled ? 'Enabled on this device' : 'Off') : 'Not supported in this browser. On iOS, add the app to the home screen first.'}>
            {n.enabled ? (
              <button type="button" className="btn secondary small" disabled={n.busy} onClick={() => void n.disable()}>
                Disable
              </button>
            ) : (
              <button type="button" className="btn small" disabled={n.busy || !n.supported} onClick={() => void n.enable()}>
                Enable
              </button>
            )}
          </SettingRow>
          <SettingRow label="Test notification" hint="Shows a local notification on this device">
            <button type="button" className="btn secondary small" disabled={n.busy} onClick={() => void n.test()}>
              Send test
            </button>
          </SettingRow>
          {n.msg ? <p className={`notice ${n.msg.tone}`}>{n.msg.text}</p> : null}
        </Section>

        <Section title="GitHub sync" id="github">
          {local.github && !editGh ? (
            <>
              <SettingRow label="Repository" hint={`${local.github.owner}/${local.github.repo}`}>
                <button type="button" className="btn secondary small" onClick={() => setEditGh(true)}>
                  Change
                </button>
              </SettingRow>
              <SettingRow
                label="Sync status"
                hint={
                  <>
                    {sync === 'error' ? <span className="down">Failed: {syncError}</span> : sync === 'pending' || sync === 'saving' ? 'Saving changes…' : 'Up to date'}
                    {local.lastPushedAt ? ` · last saved ${dateTime(local.lastPushedAt)}` : ''}
                    {feed ? ` · feed from ${dateTime(feed.generatedAt)}` : ''}
                  </>
                }
              >
                <button type="button" className="btn secondary small" onClick={() => (updateLocal((l) => ({ ...l, dirty: true })), void syncNow())} disabled={demo}>
                  Sync now
                </button>
              </SettingRow>
            </>
          ) : demo ? (
            <p className="row-empty">Not available in demo mode.</p>
          ) : (
            <GitHubForm initial={local.github} submitLabel={local.github ? 'Save & test' : 'Connect'} onDone={() => setEditGh(false)} />
          )}
        </Section>

        <Section title="Ask (local model)">
          <SettingRow label="Ollama URL" hint="Only this device. Must be localhost." htmlFor="ollama-url">
            <input
              id="ollama-url"
              className="input"
              defaultValue={local.prefs.ollamaUrl}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(v)) updateLocal((l) => ({ ...l, prefs: { ...l.prefs, ollamaUrl: v.replace(/\/$/, '') } }));
                else e.target.value = local.prefs.ollamaUrl;
              }}
            />
          </SettingRow>
          <SettingRow label="Model" htmlFor="ollama-model">
            <input id="ollama-model" className="input" defaultValue={local.prefs.ollamaModel} onBlur={(e) => e.target.value.trim() && updateLocal((l) => ({ ...l, prefs: { ...l.prefs, ollamaModel: e.target.value.trim() } }))} />
          </SettingRow>
        </Section>

        <SecuritySettings />
        <p className="disclaimer">Arbitrage · version {__APP_VERSION__}</p>
      </div>
    </div>
  );
}
