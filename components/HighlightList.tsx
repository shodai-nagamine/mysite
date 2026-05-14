'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

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

interface EditState {
  text: string;
  page: string;
  note: string;
}

export default function HighlightList({ bookId, refreshKey }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  function startEdit(h: Highlight) {
    setEditingId(h.id);
    setEditState({ text: h.text, page: h.page ? String(h.page) : '', note: h.note ?? '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit(id: string) {
    if (!editState) return;
    setSavingId(id);
    const patch = {
      text: editState.text.trim(),
      page: editState.page ? parseInt(editState.page, 10) : null,
      note: editState.note.trim() || null,
    };
    const { data, error } = await supabase
      .from('highlights')
      .update(patch)
      .eq('id', id)
      .select('id,text,page,note,created_at')
      .single();
    if (!error && data) {
      setHighlights((prev) => prev.map((h) => (h.id === id ? (data as Highlight) : h)));
      cancelEdit();
    }
    setSavingId(null);
  }

  if (loading) return <p className="text-sm text-zinc-400">読み込み中...</p>;

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
          {editingId === h.id && editState ? (
            /* 編集フォーム */
            <div className="flex flex-col gap-2">
              <textarea
                value={editState.text}
                onChange={(e) => setEditState((s) => s ? { ...s, text: e.target.value } : s)}
                rows={4}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="flex gap-2">
                <label className="flex flex-1 items-center gap-2 text-xs text-zinc-500">
                  p.
                  <input
                    type="number"
                    value={editState.page}
                    onChange={(e) => setEditState((s) => s ? { ...s, page: e.target.value } : s)}
                    placeholder="ページ"
                    className="w-20 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </label>
              </div>
              <textarea
                value={editState.note}
                onChange={(e) => setEditState((s) => s ? { ...s, note: e.target.value } : s)}
                rows={2}
                placeholder="メモ（任意）"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(h.id)}
                  disabled={savingId === h.id || !editState.text.trim()}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  {savingId === h.id ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={savingId === h.id}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            /* 表示モード */
            <>
              {h.page && (
                <span className="mb-1 inline-block text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  p. {h.page}
                </span>
              )}
              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {h.text}
              </p>
              {h.note && (
                <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  💬 {h.note}
                </p>
              )}
              {/* 操作ボタン */}
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(h)}
                  title="編集"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(h.id)}
                  disabled={deletingId === h.id}
                  title="削除"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
                >
                  🗑️
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
