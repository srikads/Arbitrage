// Repo I/O: push encrypted config, pull remote config, fetch + decrypt feed.
import { serialiseConfig, normaliseConfig, type GitHubConn } from '../lib/config';
import { DecryptError, isEnvelope } from '../lib/crypto';
import { CONFIG_PATH, FEED_PATH, readRaw, readWithSha, writeFile } from '../lib/github';
import type { Config, Envelope, Feed } from '../lib/types';
import { ring } from './vault';

export async function pushConfig(conn: GitHubConn, config: Config, sha: string | null): Promise<string> {
  const env = await ring().encryptFresh(serialiseConfig(config));
  return writeFile(conn, CONFIG_PATH, JSON.stringify(env, null, 2) + '\n', sha);
}

export type RemoteConfig = { sha: string; config: Config | null; error?: string };

export async function pullConfig(conn: GitHubConn): Promise<RemoteConfig | null> {
  const file = await readWithSha(conn, CONFIG_PATH);
  if (!file) return null;
  try {
    const env = JSON.parse(file.text) as Envelope;
    const cfg = normaliseConfig(await ring().decryptJson<Partial<Config>>(env));
    return { sha: file.sha, config: cfg };
  } catch (e) {
    return { sha: file.sha, config: null, error: e instanceof DecryptError ? 'passphrase' : 'format' };
  }
}

export type FeedResult =
  | { kind: 'ok'; feed: Feed }
  | { kind: 'missing' }
  | { kind: 'wrong-passphrase' }
  | { kind: 'invalid'; message: string };

export function validFeed(x: unknown): x is Feed {
  const f = x as Feed;
  return !!f && f.version === 1 && typeof f.generatedAt === 'string' && typeof f.instruments === 'object' && Array.isArray(f.alerts);
}

export async function fetchFeed(conn: GitHubConn): Promise<FeedResult> {
  const text = await readRaw(conn, FEED_PATH);
  if (text == null) return { kind: 'missing' };
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    return { kind: 'invalid', message: 'feed.enc is not valid JSON' };
  }
  if (!isEnvelope(env)) return { kind: 'invalid', message: 'feed.enc is not an encryption envelope' };
  let data: unknown;
  try {
    data = await ring().decryptJson<unknown>(env);
  } catch {
    return { kind: 'wrong-passphrase' };
  }
  if (!validFeed(data)) return { kind: 'invalid', message: 'Feed has an unexpected format' };
  return {
    kind: 'ok',
    feed: { ...data, digests: data.digests ?? [], resolved: data.resolved ?? {} },
  };
}
