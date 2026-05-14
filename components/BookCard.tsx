'use client';

import Image from 'next/image';
import { Book } from '@/lib/supabase';
import BuyButtons from './BuyButtons';
import StatusBadge, { normalizeReadingStatus } from './StatusBadge';

const statusBorderColor: Record<string, string> = {
  wishlist: 'border-l-pink-400 dark:border-l-pink-500',
  want:     'border-l-amber-400 dark:border-l-amber-500',
  reading:  'border-l-sky-400 dark:border-l-sky-500',
  done:     'border-l-emerald-400 dark:border-l-emerald-500',
};

interface BookCardProps {
  book: Book;
  showBuyButtons?: boolean;
  statusControl?: React.ReactNode;
  topActions?: React.ReactNode;    // 右上に配置するアクション（編集・削除など）
  actionControls?: React.ReactNode; // カード内のアクション（ISBN取得など）
  editForm?: React.ReactNode;
  footer?: React.ReactNode;        // カード下部の追加コンテンツ
}

function getPublishedYear(publishedDate?: string | null) {
  return publishedDate?.match(/\d{4}/)?.[0] ?? publishedDate;
}

export default function BookCard({
  book,
  showBuyButtons = false,
  statusControl,
  topActions,
  actionControls,
  editForm,
  footer,
}: BookCardProps) {
  const publishedYear = getPublishedYear(book.published_date);
  const status = normalizeReadingStatus(book.reading_status);
  const borderColor = statusBorderColor[status] ?? statusBorderColor.want;

  return (
    <div className={`relative flex flex-col gap-5 rounded-2xl border border-zinc-200 border-l-4 ${borderColor} bg-white p-5 shadow-sm dark:border-zinc-700 sm:flex-row`}>

      {/* 右上アクション（編集・削除） */}
      {topActions && (
        <div className="absolute right-3 top-3 flex gap-1">
          {topActions}
        </div>
      )}

      {/* 表紙画像 */}
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
          <span className="text-3xl">本</span>
        </div>
      )}

      {/* コンテンツ */}
      <div className={`flex min-w-0 flex-1 flex-col gap-1 overflow-hidden ${topActions ? 'pr-28' : ''}`}>

        {/* ステータス（タイトルの上） */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={book.reading_status} />
          {statusControl}
        </div>

        {/* タイトル・著者 */}
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold leading-tight text-zinc-900 dark:text-white">
            {book.title}
          </h2>
          {book.authors.length > 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {book.authors.join(', ')}
            </p>
          )}
        </div>

        {/* カード内アクション（ISBN取得・詳細など） */}
        {actionControls && (
          <div className="mt-2 flex flex-wrap gap-2">{actionControls}</div>
        )}

        {/* 編集フォーム */}
        {editForm}

        {/* フッター（ハイライト情報など） */}
        {footer && <div className="mt-2">{footer}</div>}

        {/* メタデータチップ */}
        <div className="mt-2 flex flex-wrap gap-2">
          {book.publisher && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.publisher}
            </span>
          )}
          {publishedYear && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {publishedYear}年
            </span>
          )}
          {book.page_count && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {book.page_count}p
            </span>
          )}
          <span
            className={`rounded-full px-3 py-0.5 text-xs ${
              book.scan_method === 'barcode'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
            }`}
          >
            {book.scan_method === 'barcode' ? 'バーコード' : 'AI認識'}
          </span>
        </div>

        {book.isbn && (
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
            ISBN: {book.isbn}
          </p>
        )}

        {book.description && (
          <p className="mt-1 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
            {book.description}
          </p>
        )}

        {book.categories.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
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

        {/* 購入ボタン：wishlist のみ表示 */}
        {showBuyButtons && (
          <div className="mt-3">
            <BuyButtons book={book} />
          </div>
        )}
      </div>
    </div>
  );
}
