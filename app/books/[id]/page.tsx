'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase, Book, ReadingStatus } from '@/lib/supabase';
import BookCard from '@/components/BookCard';
import { normalizeReadingStatus, READING_STATUS_LABELS } from '@/components/StatusBadge';
import HighlightScanner from '@/components/HighlightScanner';
import HighlightList from '@/components/HighlightList';

const BOOK_SELECT =
  'id,isbn,title,authors,publisher,published_date,description,cover_url,page_count,categories,language,raw_metadata,scan_method,reading_status,created_at';

type EditForm = {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
  published_date: string;
};

function normalizeIsbn(value?: string | null) {
  return value?.replace(/[^0-9Xx]/g, '').toUpperCase() ?? '';
}

function toEditForm(book: Book): EditForm {
  return {
    isbn: book.isbn ?? '',
    title: book.title,
    authors: book.authors.join(', '),
    publisher: book.publisher ?? '',
    published_date: book.published_date ?? '',
  };
}

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoOpenHighlight = searchParams.get('highlight') === '1';
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchingIsbn, setSearchingIsbn] = useState(false);
  const [isbnSearchMsg, setIsbnSearchMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [highlightRefreshKey, setHighlightRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

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

  function startEdit() {
    if (!book) return;
    setEditForm(toEditForm(book));
    setEditing(true);
    setError(null);
  }

  function updateField(field: keyof EditForm, value: string) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveEdit() {
    if (!book?.id || !editForm) return;
    const title = editForm.title.trim();
    if (!title) { setError('タイトルは必須です'); return; }

    setSaving(true);
    setError(null);

    const authors = editForm.authors.split(',').map((a) => a.trim()).filter(Boolean);
    const patch = {
      isbn: normalizeIsbn(editForm.isbn) || null,
      title,
      authors,
      publisher: editForm.publisher.trim() || null,
      published_date: editForm.published_date.trim() || null,
    };

    const { data, error: dbError } = await supabase
      .from('books')
      .update(patch)
      .eq('id', book.id)
      .select(BOOK_SELECT)
      .single();

    if (dbError) {
      setError(dbError.code === '23505' ? 'このISBNは既に登録されています' : dbError.message);
    } else {
      setBook(data as Book);
      setEditing(false);
    }
    setSaving(false);
  }

  async function searchIsbnFromTitle() {
    if (!editForm) return;
    const title = editForm.title.trim();
    if (!title) { setError('タイトルを入力してください'); return; }

    setSearchingIsbn(true);
    setIsbnSearchMsg(null);

    try {
      const authors = editForm.authors.split(',').map((a) => a.trim()).filter(Boolean);
      const res = await fetch('/api/identify-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, authors }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? '書籍が見つかりませんでした');
      }

      const data = await res.json();
      const found = data.book as Book;

      setEditForm((prev) => prev ? {
        ...prev,
        isbn: normalizeIsbn(found.isbn) || prev.isbn,
        title: found.title || prev.title,
        authors: found.authors.join(', ') || prev.authors,
        publisher: found.publisher || prev.publisher,
        published_date: found.published_date || prev.published_date,
      } : prev);
      const isbn = normalizeIsbn(found.isbn);
      setIsbnSearchMsg(
        isbn
          ? { type: 'success', text: `✅ ISBN: ${isbn} が見つかりました` }
          : { type: 'error', text: `「${found.title}」は見つかりましたが、ISBNを取得できませんでした` }
      );
    } catch (err) {
      setIsbnSearchMsg({ type: 'error', text: err instanceof Error ? err.message : '書籍が見つかりませんでした' });
    }
    setSearchingIsbn(false);
  }

  async function exportMarkdown() {
    if (!book) return;
    setExporting(true);

    const { data: hlData } = await supabase
      .from('highlights')
      .select('text,page,note,created_at')
      .eq('book_id', book.id)
      .order('page', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    const highlights = (hlData ?? []) as { text: string; page: number | null; note: string | null }[];
    const { READING_STATUS_LABELS } = await import('@/components/StatusBadge');
    const { normalizeReadingStatus } = await import('@/components/StatusBadge');

    const lines: string[] = [
      `# ${book.title}`,
      '',
      `- **著者**: ${book.authors.join(', ') || '不明'}`,
      book.publisher ? `- **出版社**: ${book.publisher}` : '',
      book.published_date ? `- **発行年**: ${book.published_date}` : '',
      book.isbn ? `- **ISBN**: ${book.isbn}` : '',
      `- **ステータス**: ${READING_STATUS_LABELS[normalizeReadingStatus(book.reading_status)]}`,
      book.page_count ? `- **ページ数**: ${book.page_count}` : '',
      '',
    ].filter((l) => l !== null);

    if (book.description) {
      lines.push('## 概要', '', book.description, '');
    }

    if (highlights.length > 0) {
      lines.push('## ハイライト', '');
      for (const h of highlights) {
        if (h.page) lines.push(`### p. ${h.page}`, '');
        lines.push(...h.text.split('\n').map((l) => `> ${l}`), '');
        if (h.note) lines.push(`💬 ${h.note}`, '');
      }
    }

    const md = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  async function refreshFromIsbn() {
    if (!book?.id) return;
    const isbn = normalizeIsbn(book.isbn);
    if (!isbn) { setError('ISBN がないため書誌情報を取得できません'); return; }

    setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/identify-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }

      const data = await res.json();
      const refreshed = data.book as Book;

      const { data: updated, error: dbError } = await supabase
        .from('books')
        .update({
          isbn: normalizeIsbn(refreshed.isbn) || isbn,
          title: refreshed.title,
          authors: refreshed.authors,
          publisher: refreshed.publisher,
          published_date: refreshed.published_date,
          description: refreshed.description,
          cover_url: refreshed.cover_url,
          page_count: refreshed.page_count,
          categories: refreshed.categories,
          language: refreshed.language,
          raw_metadata: refreshed.raw_metadata,
          scan_method: refreshed.scan_method,
        })
        .eq('id', book.id)
        .select(BOOK_SELECT)
        .single();

      if (dbError) throw dbError;
      setBook(updated as Book);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    }
    setRefreshing(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">読み込み中...</p>
      </main>
    );
  }

  if (error && !book) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-red-500">{error}</p>
        <Link href="/books" className="text-sm text-zinc-500 underline">本棚に戻る</Link>
      </main>
    );
  }

  if (!book) return null;

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

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <BookCard
          book={book}
          showBuyButtons={normalizeReadingStatus(book.reading_status) === 'wishlist'}
          statusControl={
            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>ステータス</span>
              <select
                value={normalizeReadingStatus(book.reading_status)}
                disabled={updatingStatus}
                onChange={(e) => updateStatus(e.target.value as ReadingStatus)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {(['wishlist', 'want', 'reading', 'done'] as ReadingStatus[]).map((s) => (
                  <option key={s} value={s}>{READING_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
          }
          topActions={
            <>
              <button
                type="button"
                onClick={startEdit}
                disabled={saving || refreshing || deleting}
                title="編集"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || refreshing || deleting}
                title="削除"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-900/20"
              >
                🗑️
              </button>
            </>
          }
          actionControls={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refreshFromIsbn}
                disabled={saving || refreshing || deleting || !normalizeIsbn(book.isbn)}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200"
              >
                {refreshing ? '取得中...' : 'ISBNから書誌情報を取得'}
              </button>
              <button
                type="button"
                onClick={exportMarkdown}
                disabled={exporting}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200"
              >
                {exporting ? '生成中...' : '📄 Markdownで出力'}
              </button>
            </div>
          }
          editForm={
            editing && editForm ? (
              <div className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
                <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  タイトル
                  <input
                    value={editForm.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  著者
                  <input
                    value={editForm.authors}
                    onChange={(e) => updateField('authors', e.target.value)}
                    placeholder="複数の場合はカンマ区切り"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    ISBN
                    <input
                      value={editForm.isbn}
                      onChange={(e) => updateField('isbn', e.target.value)}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    発行年
                    <input
                      value={editForm.published_date}
                      onChange={(e) => updateField('published_date', e.target.value)}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  出版社
                  <input
                    value={editForm.publisher}
                    onChange={(e) => updateField('publisher', e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={searchIsbnFromTitle}
                    disabled={saving || searchingIsbn}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-900/20 dark:text-violet-200"
                  >
                    {searchingIsbn ? '検索中...' : '🔍 タイトルからISBNを検索'}
                  </button>
                </div>
                {isbnSearchMsg && (
                  <p className={`text-xs ${isbnSearchMsg.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {isbnSearchMsg.type === 'error' ? '⚠️ ' : ''}{isbnSearchMsg.text}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving || searchingIsbn}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving || searchingIsbn}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : null
          }
        />
        {/* ハイライトセクション */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900 dark:text-white">
              📌 ハイライト
              <span className="ml-2 text-sm font-normal text-zinc-400">
                マーカー・下線部分を写真で記録
              </span>
            </h2>
          </div>
          <HighlightScanner
            bookId={id}
            onSaved={() => setHighlightRefreshKey((k) => k + 1)}
            autoOpen={autoOpenHighlight}
          />
          <HighlightList bookId={id} refreshKey={highlightRefreshKey} />
        </section>
      </div>
    </main>
  );
}
