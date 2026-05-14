import { Book } from '@/lib/supabase';

export interface HighlightRow {
  text: string;
  page: number | null;
  note: string | null;
  created_at: string;
}

/** YAML frontmatter + 本文の Obsidian 互換 Markdown を生成 */
export function buildObsidianMarkdown(
  book: Book,
  highlights: HighlightRow[],
  statusLabel: string,
): string {
  const authorsYaml = book.authors.length
    ? book.authors.map((a) => `  - "${a.replace(/"/g, '\\"')}"`).join('\n')
    : '  []';

  const frontmatter = [
    '---',
    `title: "${book.title.replace(/"/g, '\\"')}"`,
    `authors:\n${authorsYaml}`,
    book.isbn        ? `isbn: "${book.isbn}"`                      : null,
    book.publisher   ? `publisher: "${book.publisher.replace(/"/g, '\\"')}"` : null,
    book.published_date ? `published: "${book.published_date.slice(0, 10)}"` : null,
    `status: ${statusLabel}`,
    book.page_count  ? `page_count: ${book.page_count}`           : null,
    book.cover_url   ? `cover: "${book.cover_url}"`               : null,
    (book.tags?.length) ? `tags:\n${book.tags.map((t) => `  - ${t}`).join('\n')}` : null,
    `highlight_count: ${highlights.length}`,
    `source: bookshelf`,
    `synced: "${new Date().toISOString()}"`,
    '---',
  ].filter((l): l is string => l !== null).join('\n');

  const lines: string[] = [frontmatter, '', `# ${book.title}`, ''];

  const meta = [
    `**著者**: ${book.authors.join(', ') || '不明'}`,
    book.publisher    ? `**出版社**: ${book.publisher}` : null,
    book.published_date ? `**発行年**: ${book.published_date.slice(0, 4)}` : null,
    book.isbn         ? `**ISBN**: ${book.isbn}` : null,
    `**ステータス**: ${statusLabel}`,
    book.page_count   ? `**ページ数**: ${book.page_count}p` : null,
  ].filter((l): l is string => l !== null);

  lines.push(...meta, '');

  if (book.description) {
    lines.push('## 概要', '', book.description, '');
  }

  if (highlights.length > 0) {
    lines.push('## ハイライト', '');
    for (const h of highlights) {
      if (h.page != null) lines.push(`### p. ${h.page}`, '');
      lines.push(...h.text.split('\n').map((l) => `> ${l}`), '');
      if (h.note) lines.push(`💬 ${h.note}`, '');
    }
  }

  return lines.join('\n');
}

/** ファイル名に使えない文字を除去 */
export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|#^[\]]/g, '_').trim();
}
