import { Link, useParams } from 'react-router';
import { TopBar } from '../components/Layout';
import { Empty } from '../components/ui';
import { useIsDesktop } from '../components/useNow';
import { dateShort, dateTime, timeAgo } from '../lib/format';
import { Markdown } from '../lib/markdown';
import type { Digest } from '../lib/types';
import { useApp } from '../state/AppContext';

function DigestList({ digests, selectedId }: { digests: Digest[]; selectedId?: string }) {
  return (
    <div>
      <TopBar title="Digest" />
      {digests.length ? (
        <ul className="rows">
          {digests.map((d) => (
            <li key={d.id}>
              <Link to={`/digest/${encodeURIComponent(d.id)}`} className={`row${d.id === selectedId ? ' selected' : ''}`}>
                <div className="left">
                  <div className="title">{d.title}</div>
                  <div className="sub">
                    <span>{d.kind === 'weekly' ? 'Weekly' : 'Daily'}</span>
                    <span className="sep">·</span>
                    <span>{dateShort(d.time)}</span>
                  </div>
                </div>
                <div className="right faint">{timeAgo(d.time)}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No digests yet">
          <p>Daily and weekly summaries appear here once the watcher has written them. You can switch them on or off in Settings.</p>
        </Empty>
      )}
    </div>
  );
}

function DigestView({ d }: { d: Digest | undefined }) {
  const desktop = useIsDesktop();
  if (!d)
    return (
      <>
        <TopBar title="Digest" back={desktop ? undefined : '/digest'} />
        <Empty title="Digest not found" />
      </>
    );
  return (
    <article className="detail fade-in" key={d.id}>
      <TopBar title={d.title} sub={`${d.kind === 'weekly' ? 'Weekly' : 'Daily'} · ${dateTime(d.time)}`} back={desktop ? undefined : '/digest'} />
      <div className="page digest-body">
        <Markdown source={d.markdown} />
      </div>
    </article>
  );
}

export function DigestScreen({ detail }: { detail?: boolean }) {
  const { feed } = useApp();
  const desktop = useIsDesktop();
  const { id } = useParams();
  const digests = feed?.digests ?? [];
  const sel = id ? decodeURIComponent(id) : undefined;
  if (!desktop) return detail ? <DigestView d={digests.find((x) => x.id === sel)} /> : <DigestList digests={digests} />;
  const cur = sel ?? digests[0]?.id;
  return (
    <div className="split narrow-list">
      <div className="pane pane-list">
        <DigestList digests={digests} selectedId={cur} />
      </div>
      <div className="pane pane-detail">{cur ? <DigestView d={digests.find((x) => x.id === cur)} /> : <Empty title="Nothing to read yet" />}</div>
    </div>
  );
}
