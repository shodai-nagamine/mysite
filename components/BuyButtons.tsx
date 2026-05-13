import { Book } from '@/lib/supabase';

interface BuyButtonsProps {
  book: Book;
}

function buildSearchText(book: Book) {
  const author = book.authors[0];
  return author ? `${book.title} ${author}` : book.title;
}

function buildAmazonUrl(book: Book) {
  const query = book.isbn?.trim() || buildSearchText(book);
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`;
}

function buildRakutenUrl(book: Book) {
  const query = book.isbn?.trim() || book.title;
  return `https://books.rakuten.co.jp/search/?sitem=${encodeURIComponent(query)}`;
}

export default function BuyButtons({ book }: BuyButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={buildAmazonUrl(book)}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Amazon
      </a>
      <a
        href={buildRakutenUrl(book)}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-500"
      >
        楽天
      </a>
    </div>
  );
}
