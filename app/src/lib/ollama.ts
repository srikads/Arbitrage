// Local Ollama client (laptop mode). Only talks to the configured local URL.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const trimUrl = (u: string) => u.replace(/\/+$/, '');

export async function ollamaModels(url: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${trimUrl(url)}/api/tags`, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const j = (await res.json()) as { models?: { name: string }[] };
  return (j.models ?? []).map((m) => m.name);
}

/** Stream a chat completion; calls onToken for each chunk. Resolves with the full text. */
export async function ollamaChat(
  url: string,
  model: string,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${trimUrl(url)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.3 } }),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Ollama responded ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const j = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (j.error) throw new Error(j.error);
      const t = j.message?.content ?? '';
      if (t) {
        full += t;
        onToken(t);
      }
    }
  }
  return full;
}
