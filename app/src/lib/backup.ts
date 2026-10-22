// Encrypted backup file (same envelope format as the repo files).
import { normaliseConfig, type LocalData, type LocalPrefs } from './config';
import type { Config, Envelope } from './types';

export type Backup = {
  kind: 'arbitrage-backup';
  version: 1;
  exportedAt: string;
  config: Config;
  prefs: LocalPrefs;
  repo: { owner: string; repo: string } | null;
};

export function makeBackup(local: LocalData): Backup {
  return {
    kind: 'arbitrage-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    config: local.config,
    prefs: local.prefs,
    repo: local.github ? { owner: local.github.owner, repo: local.github.repo } : null,
  };
}

export function parseBackup(x: unknown): Backup {
  const b = x as Partial<Backup>;
  if (!b || b.kind !== 'arbitrage-backup' || !b.config) throw new Error('This file is not an Arbitrage backup.');
  return {
    kind: 'arbitrage-backup',
    version: 1,
    exportedAt: b.exportedAt ?? '',
    config: normaliseConfig(b.config),
    prefs: b.prefs as LocalPrefs,
    repo: b.repo ?? null,
  };
}

export function downloadJson(filename: string, data: Envelope): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
