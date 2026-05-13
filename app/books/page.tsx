import Link from 'next/link';
import BookList from '@/components/BookList';

export default function BooksPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Bookshelf
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              本棚
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              スキャンした本を読書ステータスごとに整理できます
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex w-fit rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            スキャンへ戻る
          </Link>
        </header>

        <BookList />
      </div>
    </main>
  );
}
