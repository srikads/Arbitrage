import { useApp } from '../state/AppContext';
import { timeAgo } from '../lib/format';
import { useNow } from './useNow';

/** Unobtrusive one-line sync + feed status. */
export function SyncIndicator({ compact }: { compact?: boolean }) {
  const { sync, syncError, feedStatus, feed, demo } = useApp();
  useNow(30_000);
  if (demo) return <span className="sync-ind">Demo data · not synced</span>;
  const syncText: Record<typeof sync, string> = {
    idle: '',
    pending: 'Changes pending',
    saving: 'Saving…',
    saved: 'Synced',
    error: 'Sync failed',
    'local-only': 'Local only',
  };
  const feedText = feedStatus === 'loading' ? 'Updating…' : feedStatus === 'offline' ? 'Offline' : feed ? `Updated ${timeAgo(feed.generatedAt)}` : '';
  const tone = sync === 'error' ? 'down' : sync === 'pending' || sync === 'saving' ? 'warn' : '';
  return (
    <span className="sync-ind" title={syncError ?? undefined}>
      {feedText && !compact ? <span>{feedText}</span> : null}
      {feedText && !compact && syncText[sync] ? <span className="faint"> · </span> : null}
      {syncText[sync] ? <span className={tone}>{syncText[sync]}</span> : null}
    </span>
  );
}
