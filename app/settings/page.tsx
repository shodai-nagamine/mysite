'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ApiToken {
  id: string;
  name: string;
  token: string;
  created_at: string;
}

export default function SettingsPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('Obsidian Sync');
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    setApiUrl(`${window.location.origin}/api/sync`);
    fetchTokens();
  }, []);

  async function fetchTokens() {
    const supabase = createClient();
    const { data } = await supabase
      .from('api_tokens')
      .select('id,name,token,created_at')
      .order('created_at', { ascending: false });
    setTokens(data ?? []);
    setLoading(false);
  }

  async function createToken() {
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('api_tokens').insert({ user_id: user.id, name: newName });
    await fetchTokens();
    setCreating(false);
  }

  async function deleteToken(id: string) {
    const supabase = createClient();
    await supabase.from('api_tokens').delete().eq('id', id);
    setTokens((prev) => prev.filter((t) => t.id !== id));
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← ホームに戻る
        </Link>
      </div>
      <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-white">設定</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Obsidian 連携 API トークン
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Obsidian プラグインからこのアプリのデータを同期するためのトークンです。
        </p>

        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">API エンドポイント</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs text-zinc-800 dark:text-zinc-200">{apiUrl}</code>
            <button
              onClick={() => copyToClipboard(apiUrl, 'url')}
              className="shrink-0 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              {copiedId === 'url' ? 'コピー済み' : 'コピー'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">読み込み中...</p>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t.name}</span>
                  <button
                    onClick={() => deleteToken(t.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-xs text-zinc-600 dark:text-zinc-400">
                    {t.token}
                  </code>
                  <button
                    onClick={() => copyToClipboard(t.token, t.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {copiedId === t.id ? 'コピー済み' : 'コピー'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  作成: {new Date(t.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="トークン名"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
          />
          <button
            onClick={createToken}
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? '作成中...' : '新規作成'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Obsidian プラグイン設定方法
        </h2>
        <ol className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">1.</span>
            上記の「新規作成」ボタンでAPIトークンを生成し、コピーする。
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">2.</span>
            Obsidian の設定 → コミュニティプラグイン → フォルダからロード で
            <code className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">obsidian-bookshelf-sync</code>
            プラグインを追加する。
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">3.</span>
            プラグイン設定で API URL とトークンを貼り付け、同期先フォルダを指定する。
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">4.</span>
            コマンドパレットから「Sync Bookshelf」を実行、または自動同期を有効にする。
          </li>
        </ol>
      </section>
    </main>
  );
}
