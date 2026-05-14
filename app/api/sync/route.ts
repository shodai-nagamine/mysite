import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildObsidianMarkdown, safeFilename, HighlightRow } from '@/lib/obsidian';
import { Book } from '@/lib/supabase';
import { READING_STATUS_LABELS, normalizeReadingStatus } from '@/components/StatusBadge';

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'Authorization header が必要です' }, { status: 401 });
  }

  const { data, error } = await supabaseAnon.rpc('get_sync_data', { p_token: token });

  if (error) {
    if (error.message.includes('invalid token') || error.message.includes('Invalid token')) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: '無効なトークンです' }, { status: 403 });
  }

  const books: Book[] = data.books ?? [];
  const highlights: Array<{ book_id: string; text: string; page: number | null; note: string | null; created_at: string }> = data.highlights ?? [];

  const hlByBook = new Map<string, HighlightRow[]>();
  for (const h of highlights) {
    const list = hlByBook.get(h.book_id) ?? [];
    list.push({ text: h.text, page: h.page, note: h.note, created_at: h.created_at });
    hlByBook.set(h.book_id, list);
  }

  const files = books.filter((b) => b.id != null).map((book) => {
    const bookHighlights = hlByBook.get(book.id!) ?? [];
    const status = normalizeReadingStatus(book.reading_status);
    const statusLabel = READING_STATUS_LABELS[status];
    const markdown = buildObsidianMarkdown(book, bookHighlights, statusLabel);
    return {
      filename: `${safeFilename(book.title)}.md`,
      book_id: book.id,
      title: book.title,
      highlight_count: bookHighlights.length,
      markdown,
    };
  });

  return NextResponse.json({ files, synced_at: new Date().toISOString() });
}
