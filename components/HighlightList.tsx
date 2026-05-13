'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Highlight {
  id: string;
  text: string;
  page: number | null;
  note: string | null;
  created_at: string;
}

interface Props {
  bookId: string;
  refreshKey?: number;
}

export default function HighlightList({ bookId, refreshKey }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('highlights')
        .select('id,text,page,note,created_at')
        .eq('book_id', bookId)
        .order('page', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      setHighlights((data ?? []) as Highlight[]);
      setLoading(false);
    }
    load();
  }, [bookId, refreshKey]);

  async function handleDelete(id: string) {
    if (!window.confirm('このハイライトを削除しますか？')) return;
    setDeletingId(id);
    await supabase.from('highlights').delete().eq('id', id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setDeletingId(null);
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  if (highlights.length === 0) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        ハイライトはまだありません
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {highlights.map((h) => (
        <div
          key={h.id}
          className="relative rounded-xl border-l-4 border-l-yellow-400 border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {/* ページ番号 */}
          {h.page && (
            <span className="mb-1 inline-block text-xs font-medium text-zinc-400 dark:text-zinc-500">
              p. {h.page}
            </span>
          )}

          {/* 本文 */}
          <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
            {h.text}
          </p>

          {/* メモ */}
          {h.note && (
            <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              💬 {h.note}
            </p>
          )}

          {/* 削除ボタン */}
          <button
            type="button"
            onClick={() => handleDelete(h.id)}
            disabled={deletingId === h.id}
            title="削除"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-xs text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
}
