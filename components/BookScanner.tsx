'use client';

import { useState, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { supabase, Book } from '@/lib/supabase';
import BookCard from './BookCard';

type ScanStatus = 'idle' | 'scanning' | 'fetching' | 'saving' | 'done' | 'error';

export default function BookScanner() {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult] = useState<Book | null>(null);
  const [history, setHistory] = useState<Book[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const tryBarcodeDetect = useCallback(async (file: File): Promise<string | null> => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      imgRef.current = img;

      const reader = new BrowserMultiFormatReader();
      const res = await reader.decodeFromImageElement(img);
      URL.revokeObjectURL(objectUrl);
      return res.getText();
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      return null;
    }
  }, []);

  const toBase64 = async (file: File): Promise<{ base64: string; mimeType: string }> => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();

      const MAX = 1000;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas が使えません');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const [, base64] = canvas.toDataURL('image/jpeg', 0.85).split(',');
      return { base64, mimeType: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    setResult(null);
    setStatusMsg('');
    setPreview(URL.createObjectURL(file));
    setStatus('scanning');
    setStatusMsg('バーコードを検索中...');

    try {
      const isbn = await tryBarcodeDetect(file);
      let body: Record<string, string>;

      if (isbn) {
        setStatusMsg(`バーコード検出: ${isbn}`);
        body = { isbn };
      } else {
        setStatusMsg('AI で書籍を識別中...');
        const { base64, mimeType } = await toBase64(file);
        body = { imageBase64: base64, mimeType };
      }

      setStatus('fetching');
      const res = await fetch('/api/identify-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? '書籍の取得に失敗しました');
      }

      const data = await res.json();
      const book: Book = data.book;

      setStatus('saving');
      setStatusMsg('データベースに保存中...');

      const { error: dbErr } = await supabase.from('books').insert({
        isbn: book.isbn,
        title: book.title,
        authors: book.authors,
        publisher: book.publisher,
        published_date: book.published_date,
        description: book.description,
        cover_url: book.cover_url,
        page_count: book.page_count,
        categories: book.categories,
        language: book.language,
        raw_metadata: book.raw_metadata,
        scan_method: book.scan_method,
      });

      if (dbErr) console.warn('Supabase save error:', dbErr.message);

      setResult(book);
      setHistory((prev) => [book, ...prev]);
      setStatus('done');
      setStatusMsg('');
    } catch (err) {
      console.error('[BookScanner]', err);
      setStatus('error');
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }, [tryBarcodeDetect]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setStatus('idle');
    setStatusMsg('');
  };

  const isLoading = status === 'scanning' || status === 'fetching' || status === 'saving';

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="relative flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="プレビュー"
            className="max-h-48 max-w-full rounded-lg object-contain shadow"
          />
        ) : (
          <>
            <span className="text-5xl">📷</span>
            <div className="text-center">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                本の表紙をアップロード
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                クリック・ドラッグ＆ドロップ・カメラ撮影
              </p>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isLoading ? '処理中...' : preview ? '別の画像を選択' : '画像を選択'}
        </button>
        {preview && !isLoading && (
          <button
            onClick={reset}
            className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            リセット
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-blue-700 dark:text-blue-300">{statusMsg}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">⚠️ {statusMsg}</p>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">取得結果</p>
          <BookCard book={result} />
        </div>
      )}

      {history.length > 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            このセッションの履歴 ({history.length - 1}件)
          </p>
          {history.slice(1).map((book, i) => (
            <BookCard key={i} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
