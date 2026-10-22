// A deliberately small, safe Markdown renderer that produces React elements
// (never raw HTML). Supports headings, paragraphs, lists, blockquotes, rules,
// tables (simple pipes), **bold**, *italic*, `code` and http(s) links.
import { Fragment, type ReactNode } from 'react';

export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${k++}`;
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = mm ? safeHref(mm[2]) : null;
      if (mm && href)
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {mm[1]}
          </a>,
        );
      else out.push(tok);
    } else out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'table'; rows: string[][] };

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      blocks.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ t: 'hr' });
      i++;
    } else if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const re = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(re, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
    } else if (trimmed.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      blocks.push({ t: 'quote', text: buf.join(' ') });
    } else if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i++]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        if (!row.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(row);
      }
      blocks.push({ t: 'table', rows });
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*+]\s|\d+[.)]\s|>|\|)/.test(lines[i].trim())) {
        buf.push(lines[i++].trim());
      }
      if (buf.length === 0) buf.push(lines[i++].trim());
      blocks.push({ t: 'p', text: buf.join(' ') });
    }
  }
  return blocks;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={className ?? 'md'}>
      {blocks.map((b, n) => {
        const key = `b${n}`;
        switch (b.t) {
          case 'h': {
            const Tag = `h${Math.min(b.level + 1, 5)}` as 'h2' | 'h3' | 'h4' | 'h5';
            return <Tag key={key}>{inline(b.text, key)}</Tag>;
          }
          case 'p':
            return <p key={key}>{inline(b.text, key)}</p>;
          case 'ul':
          case 'ol': {
            const L = b.t;
            return (
              <L key={key}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${key}-${j}`)}</li>
                ))}
              </L>
            );
          }
          case 'quote':
            return <blockquote key={key}>{inline(b.text, key)}</blockquote>;
          case 'hr':
            return <hr key={key} />;
          case 'table':
            return (
              <div className="md-table" key={key}>
                <table>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, ci) => (j === 0 ? <th key={ci}>{inline(c)}</th> : <td key={ci}>{inline(c)}</td>))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <Fragment key={key} />;
        }
      })}
    </div>
  );
}
