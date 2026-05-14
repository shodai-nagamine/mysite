'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

interface Props {
  bookId: string;
  onSaved: () => void;
  autoOpen?: boolean;
}

type Phase = 'idle' | 'camera' | 'extracting' | 'selecting' | 'saving' | 'done' | 'error';

async function imageToBase64(canvas: HTMLCanvasElement): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const [, base64] = dataUrl.split(',');
  return { base64, mimeType: 'image/jpeg' };
}

export default function HighlightScanner({ bookId, onSaved, autoOpen = false }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [snapshot, setSnapshot] = useState<string | null>(null);   // data URL for preview
  const [blocks, setBlocks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detectedPage, setDetectedPage] = useState<number | null>(null);
  const [page, setPage] = useState('');
  const [note, setNote] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // カメラ停止
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // カメラ起動
  const startCamera = useCallback(async () => {
    setPhase('camera');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch {
      setErrorMsg('カメラを起動できませんでした。カメラへのアクセスを許可してください。');
      setPhase('error');
    }
  }, []);

  // クリーンアップ
  useEffect(() => () => stopCamera(), [stopCamera]);

  // autoOpen: マウント時に自動でカメラを起動
  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      startCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 撮影 → OCR
  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setSnapshot(dataUrl);
    stopCamera();
    setPhase('extracting');

    try {
      const [, base64] = dataUrl.split(',');
      const res = await fetch('/api/extract-highlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'テキスト抽出に失敗しました');
      if (!data.blocks?.length) throw new Error('テキストが検出されませんでした');

      setBlocks(data.blocks);
      setSelected(new Set());
      setDetectedPage(data.page ?? null);
      setPage(data.page ? String(data.page) : '');
      setPhase('selecting');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'エラーが発生しました');
      setPhase('error');
    }
  }, [stopCamera]);

  // テキストブロック選択トグル
  const toggleBlock = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // 保存
  async function handleSave() {
    if (selected.size === 0) return;
    setPhase('saving');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('ログインが必要です'); setPhase('error'); return; }
    const text = blocks.filter((_, i) => selected.has(i)).join('\n');
    const { error } = await supabase.from('highlights').insert({
      user_id: user.id,
      book_id: bookId,
      text,
      page: page ? parseInt(page, 10) : null,
      note: note.trim() || null,
    });
    if (error) {
      setErrorMsg(error.message);
      setPhase('error');
    } else {
      setPhase('done');
      onSaved();
      setTimeout(() => { handleClose(); }, 900);
    }
  }

  function handleClose() {
    stopCamera();
    setOpen(false);
    setPhase('idle');
    setSnapshot(null);
    setBlocks([]);
    setSelected(new Set());
    setDetectedPage(null);
    setPage('');
    setNote('');
    setErrorMsg('');
  }

  function handleRetake() {
    setSnapshot(null);
    setBlocks([]);
    setSelected(new Set());
    setPhase('idle');
    startCamera();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); startCamera(); }}
        className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        📷 ハイライトを追加
      </button>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-white">
          {phase === 'camera' && 'ページを撮影'}
          {phase === 'extracting' && 'テキストを読み取り中...'}
          {phase === 'selecting' && 'テキストを選択'}
          {phase === 'saving' && '保存中...'}
          {phase === 'done' && '保存しました！'}
          {phase === 'error' && 'エラー'}
        </h3>
        <button type="button" onClick={handleClose}
          className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          ✕
        </button>
      </div>

      {/* カメラビュー */}
      {phase === 'camera' && (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full rounded-xl"
              style={{ maxHeight: '60vh', objectFit: 'cover' }}
            />
          </div>
          <button
            type="button"
            onClick={capture}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            <span className="text-xl">📸</span> 撮影する
          </button>
        </div>
      )}

      {/* 非表示 canvas（撮影用） */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 抽出中 */}
      {phase === 'extracting' && (
        <div className="flex flex-col gap-3">
          {snapshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot} alt="撮影画像" className="max-h-48 rounded-xl object-contain" />
          )}
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            AIがテキストを読み取り中...
          </div>
        </div>
      )}

      {/* テキスト選択 */}
      {phase === 'selecting' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            保存したいテキストをタップして選択してください
            {detectedPage !== null && (
              <span className="ml-2 font-medium text-zinc-700 dark:text-zinc-300">
                （ページ番号を自動検出: {detectedPage}）
              </span>
            )}
          </p>

          {/* テキストブロック一覧 */}
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {blocks.map((block, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleBlock(i)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  selected.has(i)
                    ? 'border-yellow-400 bg-yellow-50 text-zinc-900 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-white'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {block}
              </button>
            ))}
          </div>

          {/* ページ番号・メモ */}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              ページ番号
              <input
                type="number"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="自動検出"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
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
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={selected.size === 0}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
            >
              {selected.size > 0 ? `${selected.size}件を保存` : '選択してください'}
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
            >
              撮り直す
            </button>
          </div>
        </div>
      )}

      {/* 完了 */}
      {phase === 'done' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ 保存しました！</p>
      )}

      {/* エラー */}
      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-red-600 dark:text-red-400">⚠️ {errorMsg}</p>
          <button type="button" onClick={() => { setPhase('idle'); startCamera(); }}
            className="w-fit rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300">
            もう一度試す
          </button>
        </div>
      )}
    </div>
  );
}
