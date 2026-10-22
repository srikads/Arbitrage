import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LocalData } from '../lib/config';
import { hasVault, wipeDatabase } from '../lib/db';
import { GitHubError } from '../lib/github';
import type { Config, Feed } from '../lib/types';
import { fetchFeed, pullConfig, pushConfig } from './remote';
import { applyResolved } from './resolve';
import * as vault from './vault';

export type Phase = 'boot' | 'welcome' | 'locked' | 'ready';
export type FeedStatus = 'idle' | 'loading' | 'ok' | 'missing' | 'offline' | 'wrong-passphrase' | 'error' | 'no-repo';
export type SyncStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'local-only';

export type AppState = {
  phase: Phase;
  demo: boolean;
  local: LocalData | null;
  feed: Feed | null;
  feedStatus: FeedStatus;
  feedError: string | null;
  feedFetchedAt: number | null;
  sync: SyncStatus;
  syncError: string | null;
};

export type AppActions = {
  createVault(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  updateLocal(fn: (l: LocalData) => LocalData): void;
  updateConfig(fn: (c: Config) => Config): void;
  refresh(): Promise<void>;
  syncNow(): Promise<void>;
  changePassphrase(current: string, next: string): Promise<void>;
  replaceLocal(local: LocalData): Promise<void>;
  wipe(): Promise<void>;
};

type Ctx = AppState & AppActions;
const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Use inside unlocked screens: local data is guaranteed. */
export function useLocal(): LocalData {
  const { local } = useApp();
  if (!local) throw new Error('Locked');
  return local;
}

const INITIAL: AppState = {
  phase: 'boot',
  demo: false,
  local: null,
  feed: null,
  feedStatus: 'idle',
  feedError: null,
  feedFetchedAt: null,
  sync: 'idle',
  syncError: null,
};

const SYNC_DEBOUNCE_MS = 2000;

export function AppProvider({ children, demo }: { children: ReactNode; demo?: { local: LocalData; feed: Feed } | null }) {
  const [state, setState] = useState<AppState>(() =>
    demo
      ? { ...INITIAL, phase: 'ready', demo: true, local: demo.local, feed: demo.feed, feedStatus: 'ok', feedFetchedAt: Date.now(), sync: 'local-only' }
      : INITIAL,
  );
  const localRef = useRef<LocalData | null>(state.local);
  const feedRef = useRef<Feed | null>(state.feed);
  const syncTimer = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const isDemo = !!demo;

  const set = useCallback((patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })), []);

  useEffect(() => {
    if (isDemo) return;
    void hasVault().then((has) => set({ phase: has ? 'locked' : 'welcome' }));
  }, [isDemo, set]);

  const commitLocal = useCallback(
    (next: LocalData) => {
      localRef.current = next;
      set({ local: next });
      if (!isDemo) void vault.saveLocal(next).catch(() => undefined);
    },
    [isDemo, set],
  );

  const syncNow = useCallback(async () => {
    window.clearTimeout(syncTimer.current);
    const l = localRef.current;
    if (!l || isDemo) return;
    if (!l.github) {
      set({ sync: 'local-only', syncError: null });
      return;
    }
    if (!l.dirty) {
      set({ sync: 'saved', syncError: null });
      return;
    }
    if (saving.current) {
      syncTimer.current = window.setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
      return;
    }
    saving.current = true;
    set({ sync: 'saving', syncError: null });
    const snapshot = l.config;
    try {
      const sha = await pushConfig(l.github, snapshot, l.configSha);
      const cur = localRef.current;
      if (cur) {
        const stillSame = cur.config === snapshot;
        commitLocal({ ...cur, configSha: sha, dirty: stillSame ? false : cur.dirty, lastPushedAt: new Date().toISOString() });
        set({ sync: stillSame ? 'saved' : 'pending' });
        if (!stillSame) syncTimer.current = window.setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
      }
    } catch (e) {
      set({ sync: 'error', syncError: e instanceof Error ? e.message : String(e) });
    } finally {
      saving.current = false;
    }
  }, [commitLocal, isDemo, set]);

  const scheduleSync = useCallback(() => {
    window.clearTimeout(syncTimer.current);
    if (isDemo) return;
    if (!localRef.current?.github) {
      set({ sync: 'local-only' });
      return;
    }
    set({ sync: 'pending' });
    syncTimer.current = window.setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [isDemo, set, syncNow]);

  const updateLocal = useCallback(
    (fn: (l: LocalData) => LocalData) => {
      const cur = localRef.current;
      if (!cur) return;
      const next = fn(cur);
      commitLocal(next);
      if (next.config !== cur.config || (next.github && !cur.github)) scheduleSync();
    },
    [commitLocal, scheduleSync],
  );

  const updateConfig = useCallback(
    (fn: (c: Config) => Config) => updateLocal((l) => ({ ...l, dirty: true, config: { ...fn(l.config), updatedAt: new Date().toISOString() } })),
    [updateLocal],
  );

  const setFeed = useCallback(
    (feed: Feed) => {
      feedRef.current = feed;
      set({ feed, feedStatus: 'ok', feedError: null, feedFetchedAt: Date.now() });
      if (!isDemo) void vault.saveFeedCache(feed).catch(() => undefined);
      const l = localRef.current;
      if (l) {
        const cfg = applyResolved(l.config, feed);
        if (cfg !== l.config) updateConfig(() => cfg);
      }
    },
    [isDemo, set, updateConfig],
  );

  const refresh = useCallback(async () => {
    const l = localRef.current;
    if (isDemo) {
      set({ feedFetchedAt: Date.now() });
      return;
    }
    if (!l) return;
    if (!l.github) {
      set({ feedStatus: feedRef.current ? 'ok' : 'no-repo' });
      return;
    }
    set({ feedStatus: 'loading', feedError: null });
    try {
      const remote = await pullConfig(l.github).catch(() => null);
      if (remote && remote.config && remote.sha !== l.configSha) {
        const cur = localRef.current ?? l;
        if (!cur.dirty && remote.config.updatedAt > cur.config.updatedAt) commitLocal({ ...cur, config: remote.config, configSha: remote.sha });
        else commitLocal({ ...cur, configSha: remote.sha });
      }
      const res = await fetchFeed(l.github);
      if (res.kind === 'ok') setFeed(res.feed);
      else if (res.kind === 'missing') set({ feedStatus: 'missing' });
      else if (res.kind === 'wrong-passphrase') set({ feedStatus: 'wrong-passphrase' });
      else set({ feedStatus: 'error', feedError: res.message });
      if (localRef.current?.dirty) scheduleSync();
    } catch (e) {
      const offline = !(e instanceof GitHubError);
      set({ feedStatus: offline ? 'offline' : 'error', feedError: e instanceof Error ? e.message : String(e) });
    }
  }, [commitLocal, isDemo, scheduleSync, set, setFeed]);

  const createVault = useCallback(
    async (passphrase: string) => {
      const local = await vault.createVault(passphrase);
      localRef.current = local;
      feedRef.current = null;
      set({ phase: 'ready', local, feed: null, feedStatus: 'no-repo', sync: 'local-only' });
    },
    [set],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const { local, feed } = await vault.unlockVault(passphrase);
      localRef.current = local;
      feedRef.current = feed;
      set({ phase: 'ready', local, feed, feedStatus: feed ? 'ok' : 'idle', sync: local.github ? (local.dirty ? 'pending' : 'saved') : 'local-only' });
    },
    [set],
  );

  const lock = useCallback(() => {
    if (isDemo) return;
    window.clearTimeout(syncTimer.current);
    // Persist pending sync intent; it will be retried after the next unlock.
    vault.lockSession();
    localRef.current = null;
    feedRef.current = null;
    setState({ ...INITIAL, phase: 'locked' });
  }, [isDemo]);

  const changePassphrase = useCallback(
    async (current: string, next: string) => {
      const l = localRef.current;
      if (!l) throw new Error('Locked');
      if (!vault.ring().matches(current)) throw new Error('Current passphrase is incorrect.');
      const updated = { ...l, dirty: true, config: { ...l.config, updatedAt: new Date().toISOString() } };
      await vault.rekeyVault(next, updated, feedRef.current);
      localRef.current = updated;
      set({ local: updated });
      await syncNow();
    },
    [set, syncNow],
  );

  const replaceLocal = useCallback(
    async (next: LocalData) => {
      commitLocal({ ...next, dirty: true, config: { ...next.config, updatedAt: new Date().toISOString() } });
      scheduleSync();
    },
    [commitLocal, scheduleSync],
  );

  const wipe = useCallback(async () => {
    vault.lockSession();
    await wipeDatabase();
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      for (const r of regs ?? []) (await r.pushManager.getSubscription())?.unsubscribe();
    } catch {
      /* ignore */
    }
    localRef.current = null;
    feedRef.current = null;
    setState({ ...INITIAL, phase: 'welcome' });
  }, []);

  // Fetch feed when becoming ready (once per unlock).
  useEffect(() => {
    if (state.phase === 'ready' && !isDemo) {
      void refresh();
      if (localRef.current?.dirty) scheduleSync();
    }
  }, [state.phase, isDemo, refresh, scheduleSync]);

  const value = useMemo<Ctx>(
    () => ({ ...state, createVault, unlock, lock, updateLocal, updateConfig, refresh, syncNow, changePassphrase, replaceLocal, wipe }),
    [state, createVault, unlock, lock, updateLocal, updateConfig, refresh, syncNow, changePassphrase, replaceLocal, wipe],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
