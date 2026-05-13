import { NextRequest, NextResponse } from 'next/server';
import { Book } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface GoogleBooksVolume {
  volumeInfo: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
  totalItems?: number;
}

async function fetchGoogleBooks(query: string): Promise<Omit<Book, 'scan_method'> | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&langRestrict=`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data: GoogleBooksResponse = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  const info = item.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier;
  const isbn10 = info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier;
  const coverUrl = info.imageLinks?.thumbnail?.replace('http:', 'https:') ?? null;

  return {
    isbn: isbn13 ?? isbn10 ?? null,
    title: info.title ?? 'Unknown Title',
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    published_date: info.publishedDate ?? null,
    description: info.description ?? null,
    cover_url: coverUrl,
    page_count: info.pageCount ?? null,
    categories: info.categories ?? [],
    language: info.language ?? null,
    raw_metadata: item as unknown as Record<string, unknown>,
  };
}

async function identifyByAI(imageBase64: string, mimeType: string): Promise<{ title: string; authors: string[]; isbn: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/identify-book-cover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Edge Function の呼び出しに失敗しました');
  }

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { isbn, imageBase64, mimeType } = body as {
      isbn?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    let bookData: Omit<Book, 'scan_method'> | null = null;
    let scanMethod: 'barcode' | 'ai' = 'barcode';

    if (isbn) {
      bookData = await fetchGoogleBooks(`isbn:${isbn}`);
      if (!bookData) {
        bookData = await fetchGoogleBooks(isbn);
      }
      scanMethod = 'barcode';
    } else if (imageBase64 && mimeType) {
      scanMethod = 'ai';
      const aiResult = await identifyByAI(imageBase64, mimeType);

      if (aiResult.isbn) {
        bookData = await fetchGoogleBooks(`isbn:${aiResult.isbn}`);
      }
      if (!bookData && aiResult.title) {
        const searchQuery = aiResult.authors.length > 0
          ? `intitle:${aiResult.title} inauthor:${aiResult.authors[0]}`
          : `intitle:${aiResult.title}`;
        bookData = await fetchGoogleBooks(searchQuery);
      }
      if (!bookData) {
        bookData = {
          isbn: aiResult.isbn,
          title: aiResult.title || 'Unknown',
          authors: aiResult.authors,
          publisher: null,
          published_date: null,
          description: null,
          cover_url: null,
          page_count: null,
          categories: [],
          language: null,
          raw_metadata: {},
        };
      }
    } else {
      return NextResponse.json({ error: 'isbn または imageBase64 が必要です' }, { status: 400 });
    }

    if (!bookData) {
      return NextResponse.json({ error: '書籍が見つかりませんでした' }, { status: 404 });
    }

    return NextResponse.json({ book: { ...bookData, scan_method: scanMethod } });
  } catch (err) {
    console.error('[identify-book]', err);
    return NextResponse.json({ error: '書籍の識別に失敗しました' }, { status: 500 });
  }
}
