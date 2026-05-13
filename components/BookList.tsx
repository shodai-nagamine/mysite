'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BookCard from '@/components/BookCard';
import { Book, ReadingStatus, supabase } from '@/lib/supabase';
import { normalizeReadingStatus, READING_STATUS_LABELS } from '@/components/StatusBadge';

const FILTERS: Array<{ value: 'all' | ReadingStatus; label: string }> = [
  { value: 'all', label: 'すべて' },
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
  const [books, setBooks] = useState<Book[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | ReadingStatus>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

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

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return books.filter((book) => {
      const status = normalizeReadingStatus(book.reading_status);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [book.title, ...book.authors].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [books, query, statusFilter]);

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
      ) : (
        <div className="grid gap-4">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id ?? `${book.title}-${book.created_at}`}
              book={book}
              showBuyButtons
              actionControls={
                book.id ? (
                  <>
                    <Link
                      href={`/books/${book.id}`}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      詳細
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(book)}
                      disabled={busyAction !== null}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => refreshMetadataFromIsbn(book)}
                      disabled={busyAction !== null || !normalizeIsbn(book.isbn)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200 dark:hover:bg-sky-900/30"
                    >
                      {busyAction === `refresh:${book.id}` ? '取得中...' : 'ISBNから書誌情報を取得'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBook(book)}
                      disabled={busyAction !== null}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200 dark:hover:bg-red-900/30"
                    >
                      {busyAction === `delete:${book.id}` ? '削除中...' : '削除'}
                    </button>
                  </>
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
                        onClick={() => saveEdit(book)}
                        disabled={busyAction !== null}
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
                      {(['want', 'reading', 'done'] as ReadingStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {READING_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
