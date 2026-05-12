'use client';

import dynamic from 'next/dynamic';

const BookScanner = dynamic(() => import('@/components/BookScanner'), { ssr: false });

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          📚 本の表紙スキャン
        </h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          表紙を撮影するとバーコード (ISBN) または AI で書籍情報を取得します
        </p>
      </div>
      <BookScanner />
    </main>
  );
}
