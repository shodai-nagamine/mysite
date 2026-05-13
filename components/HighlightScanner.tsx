'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  bookId: string;
  onSaved: () => void;
}

function isHeic(file: File) {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  );
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  return Array.isArray(result) ? result[0] : result;
}

async function toBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  let blob: Blob = file;
  if (isHeic(file)) blob = await convertHeicToJpeg(file);
  const bitmap = await createImageBitmap(blob);
  const MAX = 1200;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const [, base64] = canvas.toDataURL('image/jpeg', 0.9).split(',');
  return { base64, mimeType: 'image/jpeg' };
}

export default function HighlightScanner({ bookId, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [page, setPage] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPreview(null);
    setExtractedText('');
    setPage('');
    setNote('');
    setStatus('idle');
    setErrorMsg('');
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && !isHeic(file)) return;
    setPreview(URL.createObjectURL(file));
    setExtractedText('');
    setStatus('extracting');
    setErrorMsg('');

    try {
      const { base64, mimeType } = await toBase64(file);
      const res = await fetch('/api/extract-highlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'テキスト抽出に失敗しました');
      if (!data.text) throw new Error('ハイライト・下線が見つかりませんでした');
      setExtractedText(data.text);
      setStatus('idle');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'エラーが発生しました');
      setStatus('error');
    }
  }, []);

  async function handleSave() {
    if (!extractedText.trim()) return;
    setStatus('saving');
    const { error } = await supabase.from('highlights').insert({
      book_id: bookId,
      text: extractedText.trim(),
      page: page ? parseInt(page, 10) : null,
      note: note.trim() || null,
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStatus('done');
      onSaved();
      setTimeout(() => { reset(); setOpen(false); }, 800);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        📸 ハイライトを追加
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-white">ハイライトを追加</h3>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          ✕ 閉じる
        </button>
      </div>

      {/* 撮影エリア */}
      <div
        onClick={() => status !== 'extracting' && fileInputRef.current?.click()}
        className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="プレビュー" className="max-h-48 rounded-lg object-contain" />
        ) : (
          <>
            <span className="text-4xl">📖</span>
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              ハイライト・下線部分を撮影<br />
              <span className="text-xs">クリックまたはカメラで撮影</span>
            </p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {status === 'extracting' && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          AIがテキストを読み取り中...
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400">⚠️ {errorMsg}</p>
      )}

      {status === 'done' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ 保存しました！</p>
      )}

      {/* 抽出テキスト編集 */}
      {extractedText !== '' && status !== 'extracting' && (
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            抽出されたテキスト（編集可）
            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={4}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              ページ番号（任意）
              <input
                type="number"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="例: 42"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
            </label>
            <div /> {/* spacer */}
          </div>

          <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            メモ（任意）
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="感想・コメントなど"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={status === 'saving' || !extractedText.trim()}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {status === 'saving' ? '保存中...' : '保存する'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
            >
              やり直す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
