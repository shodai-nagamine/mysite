'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { createClient } from '@/lib/supabase/client';
import { Book, ReadingStatus } from '@/lib/supabase';
import TagInput from './TagInput';
import { READING_STATUS_LABELS } from './StatusBadge';

const supabase = createClient();

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

type ScanStatus = 'idle' | 'scanning' | 'fetching' | 'saving' | 'done' | 'error';

type PendingForm = {
  title: string;
  authors: string;
  isbn: string;
  publisher: string;
  published_date: string;
  tags: string[];
  reading_status: ReadingStatus;
  _raw: Book; // 元の取得データ（cover_url等を保持）
};

const BOOK_SELECT =
  'id,isbn,title,authors,publisher,published_date,description,cover_url,page_count,categories,tags,language,raw_metadata,scan_method,reading_status,created_at';

function normalizeIsbn(value?: string | null) {
  return value?.replace(/[^0-9Xx]/g, '').toUpperCase() ?? '';
}

function isIsbnCode(text: string): boolean {
  const clean = normalizeIsbn(text);
  if (clean.length === 13) return clean.startsWith('978') || clean.startsWith('979');
  if (clean.length === 10) return /^[0-9]{9}[0-9Xx]$/.test(clean);
  return false;
}

function hasSamePrimaryAuthor(a: Book, b: Book) {
  const authorA = a.authors[0]?.trim().toLowerCase();
  const authorB = b.authors[0]?.trim().toLowerCase();
  return Boolean(authorA && authorB && authorA === authorB);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

async function findDuplicateBook(book: Book, client: ReturnType<typeof createClient>): Promise<Book | null> {
  const normalizedIsbn = normalizeIsbn(book.isbn);

  if (normalizedIsbn) {
    const { data, error } = await client.from('books').select(BOOK_SELECT).not('isbn', 'is', null);
    if (error) throw error;
    const dup = (data ?? []).find((item) => normalizeIsbn(item.isbn) === normalizedIsbn);
    if (dup) return dup as Book;
  }

  const title = book.title.trim();
  if (!title) return null;

  const { data, error } = await client.from('books').select(BOOK_SELECT).eq('title', title);
  if (error) throw error;

  const dup = (data ?? []).find((item) => {
    const existing = item as Book;
    if (book.published_date && existing.published_date !== book.published_date) return false;
    return hasSamePrimaryAuthor(book, existing);
  });
  return dup ? (dup as Book) : null;
}

function bookToPendingForm(book: Book): PendingForm {
  return {
    title: book.title,
    authors: book.authors.join(', '),
    isbn: book.isbn ?? '',
    publisher: book.publisher ?? '',
    published_date: book.published_date ?? '',
    tags: book.tags ?? [],
    reading_status: 'wishlist',
    _raw: book,
  };
}

export default function BookScanner() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [duplicateMsg, setDuplicateMsg] = useState('');
  const [pending, setPending] = useState<PendingForm | null>(null); // 未確定の取得結果
  const [result, setResult] = useState<Book | null>(null);          // DB保存済み
  const [history, setHistory] = useState<Book[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const tryBarcodeDetect = useCallback(async (file: File): Promise<string | null> => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      imgRef.current = img;

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const regions = [
        { sx: 0,      sy: 0,      sw: w,     sh: h     },
        { sx: w / 2,  sy: 0,      sw: w / 2, sh: h     },
        { sx: 0,      sy: h / 2,  sw: w,     sh: h / 2 },
        { sx: w / 2,  sy: h / 2,  sw: w / 2, sh: h / 2 },
      ];

      const candidates: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BarcodeDetectorAPI = (window as any).BarcodeDetector;

      for (const region of regions) {
        if (candidates.find(isIsbnCode)) break;
        const scale = region.sw < 600 ? 2 : 1;
        const canvas = document.createElement('canvas');
        canvas.width = region.sw * scale;
        canvas.height = region.sh * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, region.sx, region.sy, region.sw, region.sh, 0, 0, canvas.width, canvas.height);

        if (BarcodeDetectorAPI) {
          try {
            const detector = new BarcodeDetectorAPI({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
            const results = await detector.detect(canvas);
            for (const r of results) candidates.push(r.rawValue as string);
          } catch { /* 非対応フォーマット */ }
        }

        if (candidates.length === 0 && region.sx === 0 && region.sy === 0) {
          try {
            const reader = new BrowserMultiFormatReader();
            const res = await reader.decodeFromImageElement(img);
            candidates.push(res.getText());
          } catch (e) {
            if (!(e instanceof NotFoundException)) console.warn('[barcode]', e);
          }
        }
      }

      const isbnCode = candidates.find(isIsbnCode);
      return isbnCode ?? (candidates.length > 0 ? candidates[0] : null);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const toBase64 = async (file: File, onStatus?: (msg: string) => void): Promise<{ base64: string; mimeType: string }> => {
    let blob: Blob = file;
    if (isHeic(file)) {
      onStatus?.('HEIC → JPEG 変換中...');
      blob = await convertHeicToJpeg(file);
    }
    const bitmap = await createImageBitmap(blob);
    const MAX = 1000;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas が使えません');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const [, base64] = canvas.toDataURL('image/jpeg', 0.85).split(',');
    return { base64, mimeType: 'image/jpeg' };
  };

  // ① 書籍情報の取得のみ（DB保存しない）
  const identifyOnly = useCallback(async (body: Record<string, string>) => {
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
    return data.book as Book;
  }, []);

  // ② 確定ボタン押下時にDB保存
  const confirmSave = useCallback(async () => {
    if (!pending) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('ログインが必要です'); return; }

    const book = pending._raw;
    const title = pending.title.trim();
    if (!title) { alert('タイトルは必須です'); return; }

    const authors = pending.authors.split(',').map((a) => a.trim()).filter(Boolean);

    // 重複確認
    setStatus('saving');
    setStatusMsg('重複を確認中...');

    const checkBook: Book = {
      ...book,
      title,
      authors,
      isbn: normalizeIsbn(pending.isbn) || book.isbn,
      publisher: pending.publisher || book.publisher,
      published_date: pending.published_date || book.published_date,
    };

    const duplicate = await findDuplicateBook(checkBook, supabase);
    if (duplicate) {
      const msg = `「${duplicate.title}」は既に本棚に登録されています。`;
      setDuplicateMsg(msg);
      setResult(duplicate);
      setPending(null);
      setStatus('done');
      setStatusMsg('');
      window.alert(msg);
      return;
    }

    setStatusMsg('データベースに保存中...');

    const { data: inserted, error: dbErr } = await supabase
      .from('books')
      .insert({
        user_id: user.id,
        isbn: normalizeIsbn(pending.isbn) || null,
        title,
        authors,
        publisher: pending.publisher.trim() || null,
        published_date: pending.published_date.trim() || null,
        description: book.description,
        cover_url: book.cover_url,
        page_count: book.page_count,
        categories: book.categories,
        tags: pending.tags,
        language: book.language,
        raw_metadata: book.raw_metadata,
        scan_method: book.scan_method,
        reading_status: pending.reading_status,
      })
      .select(BOOK_SELECT)
      .single();

    if (dbErr) {
      if (isUniqueConstraintError(dbErr)) {
        const msg = 'このISBNの本は既に本棚に登録されています。';
        setDuplicateMsg(msg);
        setPending(null);
        setStatus('done');
        setStatusMsg('');
        window.alert(msg);
        return;
      }
      setStatus('error');
      setStatusMsg(dbErr.message);
      return;
    }

    const savedBook = (inserted as Book) ?? { ...checkBook, reading_status: pending.reading_status };
    setResult(savedBook);
    setHistory((prev) => [savedBook, ...prev]);
    setPending(null);
    setStatus('done');
    setStatusMsg('');
  }, [pending]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    setPending(null);
    setResult(null);
    setStatusMsg('');
    setDuplicateMsg('');
    setPreview(URL.createObjectURL(file));
    setStatus('scanning');
    setStatusMsg('バーコードを検索中...');

    try {
      const detected = await tryBarcodeDetect(file);
      let body: Record<string, string>;

      if (detected && isIsbnCode(detected)) {
        const normalizedIsbn = normalizeIsbn(detected);
        setStatusMsg(`ISBNバーコード検出: ${normalizedIsbn}`);
        body = { isbn: normalizedIsbn };
      } else {
        if (detected) setStatusMsg('バーコード検出（ISBN以外）→ AI で識別中...');
        else setStatusMsg('AI で書籍を識別中...');
        const { base64, mimeType } = await toBase64(file, setStatusMsg);
        body = { imageBase64: base64, mimeType };
      }

      const book = await identifyOnly(body);
      setPending(bookToPendingForm(book));
      setStatus('done');
      setStatusMsg('');
    } catch (err) {
      console.error('[BookScanner]', err);
      setStatus('error');
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }, [identifyOnly, tryBarcodeDetect]);

  const startCamera = useCallback(async () => {
    setCameraOpen(true);
    setStatus('idle');
    setStatusMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraOpen(false);
      setStatus('error');
      setStatusMsg('カメラを起動できませんでした。カメラへのアクセスを許可してください。');
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    stopCamera();
    setCameraOpen(false);
    canvas.toBlob((blob) => {
      if (!blob) return;
      handleFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }, [stopCamera, handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const reset = () => {
    stopCamera();
    setCameraOpen(false);
    setPreview(null);
    setPending(null);
    setResult(null);
    setStatus('idle');
    setStatusMsg('');
    setDuplicateMsg('');
  };

  const isLoading = status === 'scanning' || status === 'fetching' || status === 'saving';

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      {/* インラインカメラビュー */}
      {cameraOpen ? (
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
          <div className="flex gap-3">
            <button
              type="button"
              onClick={captureFromCamera}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <span className="text-xl">📸</span> 撮影する
            </button>
            <button
              type="button"
              onClick={() => { stopCamera(); setCameraOpen(false); }}
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="relative flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
            onClick={() => !isLoading && fileInputRef.current?.click()}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="プレビュー" className="max-h-48 max-w-full rounded-lg object-contain shadow" />
            ) : (
              <>
                <span className="text-5xl">🖼️</span>
                <div className="text-center">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">画像をアップロード</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">クリック・ドラッグ＆ドロップ</p>
                </div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={startCamera}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              📷 カメラで撮影
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              🖼️ ファイル
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
        </>
      )}

      <canvas ref={scanCanvasRef} className="hidden" />

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

      {duplicateMsg && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">{duplicateMsg}</p>
        </div>
      )}

      {/* 未確定の取得結果 — 編集可能フォーム */}
      {pending && (
        <div className="flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">📚 取得結果 — 確認・編集してから確定</p>
            <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-600">やり直す</button>
          </div>

          {/* 表紙プレビュー */}
          {pending._raw.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pending._raw.cover_url} alt="表紙" className="h-32 w-auto self-start rounded-lg object-contain shadow" />
          )}

          <div className="grid gap-3">
            <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              タイトル *
              <input
                value={pending.title}
                onChange={(e) => setPending((p) => p ? { ...p, title: e.target.value } : p)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              />
            </label>

            <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              著者
              <input
                value={pending.authors}
                onChange={(e) => setPending((p) => p ? { ...p, authors: e.target.value } : p)}
                placeholder="複数の場合はカンマ区切り"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                ISBN
                <input
                  value={pending.isbn}
                  onChange={(e) => setPending((p) => p ? { ...p, isbn: e.target.value } : p)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                発行年
                <input
                  value={pending.published_date}
                  onChange={(e) => setPending((p) => p ? { ...p, published_date: e.target.value } : p)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                />
              </label>
            </div>

            <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              出版社
              <input
                value={pending.publisher}
                onChange={(e) => setPending((p) => p ? { ...p, publisher: e.target.value } : p)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              />
            </label>

            <div className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              タグ
              <TagInput
                tags={pending.tags}
                onChange={(tags) => setPending((p) => p ? { ...p, tags } : p)}
              />
            </div>

            <label className="grid gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              ステータス
              <select
                value={pending.reading_status}
                onChange={(e) => setPending((p) => p ? { ...p, reading_status: e.target.value as ReadingStatus } : p)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              >
                {(['wishlist', 'want', 'reading', 'done'] as ReadingStatus[]).map((s) => (
                  <option key={s} value={s}>{READING_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={confirmSave}
            disabled={isLoading}
            className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'saving' ? '保存中...' : '✅ 確定して本棚に追加'}
          </button>
        </div>
      )}

      {/* DB保存済みの結果 */}
      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">✅ 本棚に追加しました</p>
          <div
            onClick={() => result.id && router.push(`/books/${result.id}`)}
            className={result.id ? 'cursor-pointer' : ''}
          >
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-medium text-zinc-900 dark:text-white">{result.title}</p>
              <p className="text-sm text-zinc-500">{result.authors.join(', ')}</p>
              {(result.tags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(result.tags ?? []).map((t) => (
                    <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {result.id && (
              <Link
                href={`/books/${result.id}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                ✏️ 詳細・編集
              </Link>
            )}
            <button
              onClick={reset}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              📷 続けてスキャン
            </button>
          </div>
          <Link
            href="/books"
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            📚 本棚を見る →
          </Link>
        </div>
      )}

      {history.length > 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            このセッションの履歴 ({history.length - 1}件)
          </p>
          {history.slice(1).map((book, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">{book.title}</p>
              <p className="text-xs text-zinc-500">{book.authors.join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
