import Link from 'next/link';
import { BookOpen, ScanLine, Tag, Highlighter, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'ZenRead — 読んだ本を、ちゃんと自分のものにする。',
  description:
    'バーコードスキャンで本を登録、読書ステータスを管理、ハイライトを記録。Obsidianとも同期できる読書管理アプリ。',
};

const features = [
  {
    icon: ScanLine,
    title: 'スキャンで即登録',
    description:
      'バーコードをカメラでスキャンするだけで書誌情報を自動取得。タイトル検索でも追加できます。',
  },
  {
    icon: Tag,
    title: 'ステータス & タグ管理',
    description:
      '「欲しい・積読・読書中・読了」の4ステータスと自由なタグで、本棚を思いどおりに整理。',
  },
  {
    icon: Highlighter,
    title: 'ハイライトを残す',
    description:
      '気になった一文や感想をその場でメモ。あとから見返せるハイライト機能で読書が深まります。',
  },
  {
    icon: RefreshCw,
    title: 'Obsidian と同期',
    description:
      '記録した本棚データをObsidianへ自動エクスポート。知識のネットワークにシームレスに繋がります。',
  },
];

const steps = [
  {
    number: '01',
    title: 'スキャン',
    description: 'バーコードをかざすだけ。本の情報が自動で登録されます。',
  },
  {
    number: '02',
    title: '記録',
    description: '読書の進捗やハイライトをサクッとメモ。習慣になります。',
  },
  {
    number: '03',
    title: '振り返り',
    description: 'タグやステータスで整理された本棚を眺め、学びを再確認。',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* ── Minimal nav ── */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white">
            <BookOpen className="h-4 w-4 text-white dark:text-zinc-900" />
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            ZenRead
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ログイン
        </Link>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-3xl px-6 pb-24 pt-20 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            無料で使えます
          </div>

          <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
            読んだ本を、<br />
            ちゃんと自分のものにする。
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
            バーコードをスキャンするだけで本棚に登録。読書記録・ハイライト・Obsidian同期まで、シンプルにひとつにまとめました。
          </p>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Googleアカウントで無料で始める
          </Link>
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
            クレジットカード不要 · いつでも退会できます
          </p>
        </section>

        {/* ── Features ── */}
        <section className="border-t border-zinc-100 bg-zinc-50 px-6 py-20 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-3 text-center text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
              読書をもっとシンプルに
            </h2>
            <p className="mb-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              必要なものだけを、使いやすく。
            </p>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950">
                    <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-center text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
              たった3ステップで始まる
            </h2>
            <p className="mb-14 text-center text-sm text-zinc-500 dark:text-zinc-400">
              アプリを開いてすぐ使えます。
            </p>

            <div className="relative">
              {/* connector line (desktop) */}
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-8 hidden h-0.5 w-2/3 -translate-x-1/2 bg-zinc-100 dark:bg-zinc-800 sm:block"
              />

              <ol className="flex flex-col gap-10 sm:flex-row sm:gap-0">
                {steps.map(({ number, title, description }, idx) => (
                  <li
                    key={number}
                    className={`relative flex flex-1 flex-col items-center text-center ${
                      idx < steps.length - 1 ? 'sm:pr-6' : ''
                    }`}
                  >
                    <div className="relative z-10 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-zinc-200 bg-white text-xl font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
                      {number}
                    </div>
                    <h3 className="mb-1.5 text-base font-semibold text-zinc-900 dark:text-white">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {description}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-zinc-100 bg-zinc-50 px-6 py-20 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-white">
                <BookOpen className="h-7 w-7 text-white dark:text-zinc-900" />
              </div>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
              今日から始めよう
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              積み重ねた読書が、あなたの知識になる。
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Googleアカウントで無料で始める
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 px-6 py-8 dark:border-zinc-800">
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
          © 2025 ZenRead
        </p>
      </footer>
    </div>
  );
}
