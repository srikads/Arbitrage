// Minimal GitHub REST contents API client (CONTRACT §3). Talks only to
// api.github.com with the user's fine-grained token.
import { b64ToUtf8, utf8ToB64 } from './b64';
import type { GitHubConn } from './config';

const API = 'https://api.github.com';
export const CONFIG_PATH = 'data/config.enc';
export const FEED_PATH = 'data/feed.enc';
export const CONFIG_COMMIT_MESSAGE = 'chore: update config';

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

function headers(conn: GitHubConn, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${conn.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

const enc = encodeURIComponent;
const contentsUrl = (c: GitHubConn, path: string) => `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/contents/${path.split('/').map(enc).join('/')}`;

async function fail(res: Response): Promise<never> {
  let msg = res.statusText || `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { message?: string };
    if (j.message) msg = j.message;
  } catch {
    /* ignore */
  }
  if (res.status === 401) msg = 'Token rejected (401). Check that it is valid and not expired.';
  if (res.status === 403) msg = `Access denied (403): ${msg}`;
  throw new GitHubError(res.status, msg);
}

export type RepoInfo = { fullName: string; private: boolean; defaultBranch: string };

/** Verify token + repository access. */
export async function verifyRepo(conn: GitHubConn, fetchImpl: typeof fetch = fetch): Promise<RepoInfo> {
  const res = await fetchImpl(`${API}/repos/${enc(conn.owner)}/${enc(conn.repo)}`, {
    headers: headers(conn),
    cache: 'no-store',
  });
  if (res.status === 404) throw new GitHubError(404, 'Repository not found, or the token has no access to it.');
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { full_name: string; private: boolean; default_branch: string };
  return { fullName: j.full_name, private: j.private, defaultBranch: j.default_branch };
}

/** Read a file's raw text. Uses the raw media type so files > 1 MB work. Returns null on 404. */
export async function readRaw(conn: GitHubConn, path: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchImpl(contentsUrl(conn, path), {
    headers: headers(conn, 'application/vnd.github.raw+json'),
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  return res.text();
}

/** Read a small file with its sha (needed for updates). Returns null on 404. */
export async function readWithSha(conn: GitHubConn, path: string, fetchImpl: typeof fetch = fetch): Promise<{ sha: string; text: string } | null> {
  const res = await fetchImpl(contentsUrl(conn, path), { headers: headers(conn), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let text = '';
  if (j.encoding === 'base64' && j.content) text = b64ToUtf8(j.content);
  else text = (await readRaw(conn, path, fetchImpl)) ?? '';
  return { sha: j.sha, text };
}

/**
 * Create or update a file. On a sha conflict (409, or 422 when the sha is
 * missing/stale) the current sha is refetched and the write retried.
 */
export async function writeFile(
  conn: GitHubConn,
  path: string,
  text: string,
  sha: string | null,
  message = CONFIG_COMMIT_MESSAGE,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let currentSha = sha;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, string> = { message, content: utf8ToB64(text) };
    if (currentSha) body.sha = currentSha;
    const res = await fetchImpl(contentsUrl(conn, path), {
      method: 'PUT',
      headers: { ...headers(conn), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = (await res.json()) as { content: { sha: string } };
      return j.content.sha;
    }
    if (res.status === 409 || res.status === 422) {
      const latest = await readWithSha(conn, path, fetchImpl);
      const next = latest?.sha ?? null;
      if (next === currentSha && res.status === 422) await fail(res);
      currentSha = next;
      continue;
    }
    await fail(res);
  }
  throw new GitHubError(409, 'Could not write config after retries (conflict).');
}
