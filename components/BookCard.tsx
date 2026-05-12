'use client';

import Image from 'next/image';
import { Book } from '@/lib/supabase';

interface BookCardProps {
  book: Book;
}

export default function BookCard({ book }: BookCardProps) {
  return (
    <div className="flex gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {book.cover_url ? (
        <div className="relative h-36 w-24 flex-shrink-0 overflow-hidden rounded-lg shadow-md">
          <Image
            src={book.cover_url}
            alt={book.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-36 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <span className="text-3xl">📚</span>
        </div>
      )}

      <div className="flex flex-col gap-1 overflow-hidden">
        <h2 className="text-lg font-bold leading-tight text-zinc-900 dark:text-white">
          {book.title}
        </h2>

        {book.authors.length > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {book.authors.join(', ')}
          </p>
        )}

        <div className="mt-1 flex flex-wrap gap-2">
          {book.publisher && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.publisher}
            </span>
          )}
          {book.published_date && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.published_date}
            </span>
          )}
          {book.page_count && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.page_count}ページ
            </span>
          )}
          {book.language && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.language.toUpperCase()}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-0.5 text-xs ${
              book.scan_method === 'barcode'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
            }`}
          >
            {book.scan_method === 'barcode' ? '📊 バーコード' : '✨ AI認識'}
          </span>
        </div>

        {book.isbn && (
          <p className="mt-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">
            ISBN: {book.isbn}
          </p>
        )}

        {book.description && (
          <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
            {book.description}
          </p>
        )}

        {book.categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {book.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              >
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
