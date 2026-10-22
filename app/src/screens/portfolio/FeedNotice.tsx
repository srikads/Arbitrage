import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { timeAgo } from '../../lib/format';
import { useApp } from '../../state/AppContext';

export function FeedNotice() {
  const { feedStatus, feedError, feed, local, demo } = useApp();
  if (demo) return null;
  let body: ReactNode = null;
  let cls = 'notice';
  switch (feedStatus) {
    case 'no-repo':
      body = (
        <>
          <strong>Not connected.</strong> Your data stays on this device until you <Link to="/settings#github">connect your GitHub repository</Link>. The
          watcher needs it to follow prices and send signals.
        </>
      );
      break;
    case 'missing':
      body = (
        <>
          <strong>Waiting for the first watcher run.</strong> Your configuration is in <code>data/config.enc</code>; the scheduled workflow will write
          <code>data/feed.enc</code> on its next run. Check that GitHub Actions is enabled in{' '}
          {local?.github ? `${local.github.owner}/${local.github.repo}` : 'your repo'} and that the secret <code>ARB_PASSPHRASE</code> is set.
        </>
      );
      break;
    case 'wrong-passphrase':
      cls += ' error';
      body = (
        <>
          <strong>The feed could not be decrypted.</strong> The repository secret <code>ARB_PASSPHRASE</code> probably does not match your passphrase. Update
          the secret, then wait for the next watcher run.
        </>
      );
      break;
    case 'offline':
      cls += ' warn';
      body = <>Offline{feed ? ` — showing data from ${timeAgo(feed.generatedAt)}` : ''}. It refreshes when you are back online.</>;
      break;
    case 'error':
      cls += ' error';
      body = (
        <>
          <strong>Could not load the feed.</strong> {feedError}
        </>
      );
      break;
    default:
      if (feed && Date.now() - Date.parse(feed.generatedAt) > 36 * 3_600_000) {
        cls += ' warn';
        body = <>The last watcher run was {timeAgo(feed.generatedAt)}. Check the workflow in your repository.</>;
      }
  }
  if (!body) return null;
  return (
    <div className="feed-notice">
      <p className={cls} role="status">
        {body}
      </p>
    </div>
  );
}
