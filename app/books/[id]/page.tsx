'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, Book, ReadingStatus } from '@/lib/supabase';
import BookCard from '@/components/BookCard';
import { normalizeReadingStatus, READING_STATUS_LABELS } from '@/components/StatusBadge';

const BOOK_SELECT =
  'id,isbn,title,authors,publisher,published_date,description,cover_url,page_count,categories,language,raw_metadata,scan_method,reading_status,created_at';

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from('books')
        .select(BOOK_SELECT)
        .eq('id', id)
        .single();

      if (dbError) setError(dbError.message);
      else setBook(data as Book);
      setLoading(false);
    }
    load();
  }, [id]);

  async function updateStatus(status: ReadingStatus) {
    if (!book?.id) return;
    setUpdatingStatus(true);
    const { error: dbError } = await supabase
      .from('books')
      .update({ reading_status: status })
      .eq('id', book.id);
    if (!dbError) setBook((prev) => (prev ? { ...prev, reading_status: status } : prev));
    setUpdatingStatus(false);
  }

  async function handleDelete() {
    if (!book?.id) return;
    if (!window.confirm(`「${book.title}」を本棚から削除しますか？`)) return;
    setDeleting(true);
    await supabase.from('books').delete().eq('id', book.id);
    router.push('/books');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">読み込み中...</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-red-500">{error ?? '本が見つかりませんでした'}</p>
        <Link href="/books" className="text-sm text-zinc-500 underline">
          本棚に戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/books"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ← 本棚に戻る
          </Link>
        </div>

        <BookCard
          book={book}
          showBuyButtons
          statusControl={
            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>ステータス</span>
              <select
                value={normalizeReadingStatus(book.reading_status)}
                disabled={updatingStatus}
                onChange={(e) => updateStatus(e.target.value as ReadingStatus)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {(['want', 'reading', 'done'] as ReadingStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {READING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          }
          actionControls={
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200"
            >
              {deleting ? '削除中...' : '本棚から削除'}
            </button>
          }
        />
      </div>
    </main>
  );
}
