'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BookCard from '@/components/BookCard';
import { Book, ReadingStatus, supabase } from '@/lib/supabase';
import { normalizeReadingStatus, READING_STATUS_LABELS } from '@/components/StatusBadge';

type ViewMode = 'card' | 'list';
type SortKey = 'created_at_desc' | 'created_at_asc' | 'title_asc' | 'title_desc' | 'highlight_desc';
type HighlightSummary = { count: number; latestText: string | null };

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'created_at_desc', label: '登録日（新しい順）' },
  { value: 'created_at_asc',  label: '登録日（古い順）' },
  { value: 'title_asc',       label: 'タイトル（昇順）' },
  { value: 'title_desc',      label: 'タイトル（降順）' },
  { value: 'highlight_desc',  label: 'ハイライト（多い順）' },
];

const FILTERS: Array<{ value: 'all' | ReadingStatus; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'wishlist', label: '欲しい！' },
  { value: 'want', label: '積読' },
  { value: 'reading', label: '読書中' },
  { value: 'done', label: '読了' },
];

type EditForm = {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
  published_date: string;
};

const BOOK_SELECT =
  'id,isbn,title,authors,publisher,published_date,description,cover_url,page_count,categories,language,raw_metadata,scan_method,reading_status,created_at';

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

export default function BookList() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | ReadingStatus>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('bookshelf-view') as ViewMode) ?? 'card';
    }
    return 'card';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchingIsbnFor, setSearchingIsbnFor] = useState<string | null>(null);
  const [isbnSearchMsg, setIsbnSearchMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created_at_desc');
  const [highlightSummaries, setHighlightSummaries] = useState<Map<string, HighlightSummary>>(new Map());

  useEffect(() => {
    let mounted = true;

    async function loadBooks() {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (dbError) {
        setError(dbError.message);
        setBooks([]);
      } else {
        setBooks((data ?? []) as Book[]);
      }

      setLoading(false);
    }

    loadBooks();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const ids = books.map((b) => b.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) { setHighlightSummaries(new Map()); return; }
    supabase
      .from('highlights')
      .select('book_id,text,created_at')
      .in('book_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const map = new Map<string, HighlightSummary>();
        for (const h of data ?? []) {
          const existing = map.get(h.book_id);
          if (!existing) {
            map.set(h.book_id, { count: 1, latestText: h.text });
          } else {
            map.set(h.book_id, { count: existing.count + 1, latestText: existing.latestText });
          }
        }
        setHighlightSummaries(map);
      });
  }, [books]);

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = books.filter((book) => {
      const status = normalizeReadingStatus(book.reading_status);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = [book.title, ...book.authors].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'created_at_asc':
          return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        case 'title_asc':
          return a.title.localeCompare(b.title, 'ja');
        case 'title_desc':
          return b.title.localeCompare(a.title, 'ja');
        case 'highlight_desc':
          return (highlightSummaries.get(b.id ?? '')?.count ?? 0) - (highlightSummaries.get(a.id ?? '')?.count ?? 0);
        default:
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
    });
  }, [books, query, statusFilter, sortKey, highlightSummaries]);

  async function updateStatus(book: Book, readingStatus: ReadingStatus) {
    if (!book.id) return;

    const previousBooks = books;
    setUpdatingId(book.id);
    setError(null);
    setBooks((current) =>
      current.map((item) =>
        item.id === book.id ? { ...item, reading_status: readingStatus } : item
      )
    );

    const { error: dbError } = await supabase
      .from('books')
      .update({ reading_status: readingStatus })
      .eq('id', book.id);

    if (dbError) {
      setBooks(previousBooks);
      setError(dbError.message);
    }

    setUpdatingId(null);
  }

  function startEdit(book: Book) {
    if (!book.id) return;
    setError(null);
    setEditingId(book.id);
    setEditForm(toEditForm(book));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function searchIsbnFromTitle(bookId: string) {
    if (!editForm) return;
    const title = editForm.title.trim();
    if (!title) { setError('タイトルを入力してください'); return; }

    setSearchingIsbnFor(bookId);
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
      const foundIsbn = normalizeIsbn(found.isbn);
      setIsbnSearchMsg(
        foundIsbn
          ? { type: 'success', text: `✅ ISBN: ${foundIsbn} が見つかりました` }
          : { type: 'error', text: `「${found.title}」は見つかりましたが、ISBNを取得できませんでした` }
      );
    } catch (err) {
      setIsbnSearchMsg({ type: 'error', text: getErrorMessage(err) });
    }
    setSearchingIsbnFor(null);
  }

  function updateEditField(field: keyof EditForm, value: string) {
    setEditForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveEdit(book: Book) {
    if (!book.id || !editForm) return;

    const title = editForm.title.trim();
    if (!title) {
      setError('タイトルは必須です');
      return;
    }

    const authors = editForm.authors
      .split(',')
      .map((author) => author.trim())
      .filter(Boolean);
    const normalizedIsbn = normalizeIsbn(editForm.isbn);

    setBusyAction(`edit:${book.id}`);
    setError(null);

    const patch = {
      isbn: normalizedIsbn || null,
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
      setError(
        dbError.code === '23505'
          ? 'このISBNの本は既に登録されています'
          : dbError.message
      );
    } else {
      setBooks((current) =>
        current.map((item) => (item.id === book.id ? (data as Book) : item))
      );
      cancelEdit();
    }

    setBusyAction(null);
  }

  async function deleteBook(book: Book) {
    if (!book.id) return;
    if (!window.confirm(`「${book.title}」を本棚から削除しますか？`)) return;

    setBusyAction(`delete:${book.id}`);
    setError(null);

    const { error: dbError } = await supabase.from('books').delete().eq('id', book.id);

    if (dbError) {
      setError(dbError.message);
    } else {
      setBooks((current) => current.filter((item) => item.id !== book.id));
      if (editingId === book.id) cancelEdit();
    }

    setBusyAction(null);
  }

  async function refreshMetadataFromIsbn(book: Book) {
    if (!book.id) return;

    const normalizedIsbn = normalizeIsbn(book.isbn);
    if (!normalizedIsbn) {
      setError('ISBN がないため書誌情報を取得できません');
      return;
    }

    setBusyAction(`refresh:${book.id}`);
    setError(null);

    try {
      const res = await fetch('/api/identify-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: normalizedIsbn }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? '書誌情報の取得に失敗しました');
      }

      const data = await res.json();
      const refreshedBook = data.book as Book;

      const { data: updated, error: dbError } = await supabase
        .from('books')
        .update({
          isbn: normalizeIsbn(refreshedBook.isbn) || normalizedIsbn,
          title: refreshedBook.title,
          authors: refreshedBook.authors,
          publisher: refreshedBook.publisher,
          published_date: refreshedBook.published_date,
          description: refreshedBook.description,
          cover_url: refreshedBook.cover_url,
          page_count: refreshedBook.page_count,
          categories: refreshedBook.categories,
          language: refreshedBook.language,
          raw_metadata: refreshedBook.raw_metadata,
          scan_method: refreshedBook.scan_method,
        })
        .eq('id', book.id)
        .select(BOOK_SELECT)
        .single();

      if (dbError) throw dbError;

      setBooks((current) =>
        current.map((item) => (item.id === book.id ? (updated as Book) : item))
      );
      if (editingId === book.id) {
        setEditForm(toEditForm(updated as Book));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }

    setBusyAction(null);
  }

  return (
    <section className="w-full">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                statusFilter === filter.value
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {filter.label}
            </button>
          ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* ソート */}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {/* 表示切替 */}
            <div className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => { setViewMode('card'); localStorage.setItem('bookshelf-view', 'card'); }}
                title="カード表示"
                className={`px-3 py-2 text-sm transition ${viewMode === 'card' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400'}`}
              >
                ▦
              </button>
              <button
                type="button"
                onClick={() => { setViewMode('list'); localStorage.setItem('bookshelf-view', 'list'); }}
                title="リスト表示"
                className={`px-3 py-2 text-sm transition ${viewMode === 'list' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400'}`}
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="タイトル・著者で検索"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-500"
        />
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          読み込み中...
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          条件に合う本がありません
        </div>
      ) : viewMode === 'list' ? (
        /* リスト表示 */
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          {filteredBooks.map((book, i) => (
            <div key={book.id ?? `${book.title}-${book.created_at}`}>
              <div className={`flex items-center gap-2 px-3 py-2.5 ${i > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}`}>
                {/* クリッカブルエリア（サムネイル・タイトル・著者） */}
                <Link
                  href={book.id ? `/books/${book.id}` : '#'}
                  className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80"
                >
                  {/* サムネイル */}
                  <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    {book.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg">📖</div>
                    )}
                  </div>
                  {/* タイトル・著者 */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{book.title}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{book.authors.join(', ')}</p>
                  </div>
                </Link>
                {/* ステータス（プルダウン） */}
                {book.id ? (
                  <select
                    value={normalizeReadingStatus(book.reading_status)}
                    disabled={updatingId === book.id}
                    onChange={(event) => updateStatus(book, event.target.value as ReadingStatus)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    {(['wishlist', 'want', 'reading', 'done'] as ReadingStatus[]).map((s) => (
                      <option key={s} value={s}>{READING_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    normalizeReadingStatus(book.reading_status) === 'reading' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    normalizeReadingStatus(book.reading_status) === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                    normalizeReadingStatus(book.reading_status) === 'wishlist' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' :
                    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}>
                    {READING_STATUS_LABELS[normalizeReadingStatus(book.reading_status)]}
                  </span>
                )}
                {/* ハイライト・編集・削除ボタン */}
                {book.id && (
                  <div className="flex shrink-0 gap-1">
                    <Link
                      href={`/books/${book.id}?highlight=1`}
                      title="ハイライト"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-zinc-400 transition hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-900/20"
                    >
                      📝
                    </Link>
                  </div>
                )}
                {/* 編集・削除ボタン */}
                {book.id && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(book)}
                      disabled={busyAction !== null}
                      title="編集"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBook(book)}
                      disabled={busyAction === `delete:${book.id}`}
                      title="削除"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
                    >
                      {busyAction === `delete:${book.id}` ? '…' : '🗑️'}
                    </button>
                  </div>
                )}
              </div>
              {/* インライン編集フォーム */}
              {book.id && editingId === book.id && editForm && (
                <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
                  <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      タイトル
                      <input
                        value={editForm.title}
                        onChange={(event) => updateEditField('title', event.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      著者
                      <input
                        value={editForm.authors}
                        onChange={(event) => updateEditField('authors', event.target.value)}
                        placeholder="複数の場合はカンマ区切り"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        ISBN
                        <input
                          value={editForm.isbn}
                          onChange={(event) => updateEditField('isbn', event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        発行年
                        <input
                          value={editForm.published_date}
                          onChange={(event) => updateEditField('published_date', event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      出版社
                      <input
                        value={editForm.publisher}
                        onChange={(event) => updateEditField('publisher', event.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsbnSearchMsg(null); searchIsbnFromTitle(book.id!); }}
                        disabled={busyAction !== null || searchingIsbnFor !== null}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-900/20 dark:text-violet-200"
                      >
                        {searchingIsbnFor === book.id ? '検索中...' : '🔍 タイトルからISBNを検索'}
                      </button>
                    </div>
                    {isbnSearchMsg && editingId === book.id && (
                      <p className={`text-xs ${isbnSearchMsg.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isbnSearchMsg.type === 'error' ? '⚠️ ' : ''}{isbnSearchMsg.text}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(book)}
                        disabled={busyAction !== null || searchingIsbnFor !== null}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {busyAction === `edit:${book.id}` ? '保存中...' : '保存'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* カード表示 */
        <div className="grid gap-4">
          {filteredBooks.map((book) => (
            <div
              key={book.id ?? `${book.title}-${book.created_at}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a, select, input, textarea')) return;
                if (book.id) router.push(`/books/${book.id}`);
              }}
              className={book.id ? 'cursor-pointer' : ''}
            >
            <BookCard
              book={book}
              showBuyButtons={normalizeReadingStatus(book.reading_status) === 'wishlist'}
              topActions={
                book.id ? (
                  <>
                    <Link
                      href={`/books/${book.id}?highlight=1`}
                      title="ハイライト"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-200 bg-yellow-50 text-sm transition hover:bg-yellow-100 dark:border-yellow-900/60 dark:bg-yellow-900/20"
                    >
                      📝
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(book)}
                      disabled={busyAction !== null}
                      title="編集"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBook(book)}
                      disabled={busyAction !== null}
                      title="削除"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-900/20 dark:hover:bg-red-900/30"
                    >
                      🗑️
                    </button>
                  </>
                ) : null
              }
              actionControls={
                book.id ? (
                  <button
                    type="button"
                    onClick={() => refreshMetadataFromIsbn(book)}
                    disabled={busyAction !== null || !normalizeIsbn(book.isbn)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200 dark:hover:bg-sky-900/30"
                  >
                    {busyAction === `refresh:${book.id}` ? '取得中...' : 'ISBNから書誌情報を取得'}
                  </button>
                ) : null
              }
              editForm={
                book.id && editingId === book.id && editForm ? (
                  <div className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      タイトル
                      <input
                        value={editForm.title}
                        onChange={(event) => updateEditField('title', event.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      著者
                      <input
                        value={editForm.authors}
                        onChange={(event) => updateEditField('authors', event.target.value)}
                        placeholder="複数の場合はカンマ区切り"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        ISBN
                        <input
                          value={editForm.isbn}
                          onChange={(event) => updateEditField('isbn', event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        発行年
                        <input
                          value={editForm.published_date}
                          onChange={(event) => updateEditField('published_date', event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      出版社
                      <input
                        value={editForm.publisher}
                        onChange={(event) => updateEditField('publisher', event.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsbnSearchMsg(null); searchIsbnFromTitle(book.id!); }}
                        disabled={busyAction !== null || searchingIsbnFor !== null}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-900/20 dark:text-violet-200"
                      >
                        {searchingIsbnFor === book.id ? '検索中...' : '🔍 タイトルからISBNを検索'}
                      </button>
                    </div>
                    {isbnSearchMsg && editingId === book.id && (
                      <p className={`text-xs ${isbnSearchMsg.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isbnSearchMsg.type === 'error' ? '⚠️ ' : ''}{isbnSearchMsg.text}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(book)}
                        disabled={busyAction !== null || searchingIsbnFor !== null}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {busyAction === `edit:${book.id}` ? '保存中...' : '保存'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busyAction !== null}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : null
              }
              statusControl={
                book.id ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>ステータス</span>
                    <select
                      value={normalizeReadingStatus(book.reading_status)}
                      disabled={updatingId === book.id}
                      onChange={(event) => updateStatus(book, event.target.value as ReadingStatus)}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      {(['wishlist', 'want', 'reading', 'done'] as ReadingStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {READING_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null
              }
              footer={
                book.id && highlightSummaries.has(book.id) ? (() => {
                  const hl = highlightSummaries.get(book.id!)!;
                  return (
                    <div className="flex flex-col gap-1 rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-900/10">
                      <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                        📌 {hl.count}件のハイライト
                      </p>
                      {hl.latestText && (
                        <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {hl.latestText}
                        </p>
                      )}
                    </div>
                  );
                })() : null
              }
            />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
