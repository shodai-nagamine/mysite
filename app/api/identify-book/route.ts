import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Book } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `この本の表紙画像からタイトル、著者名、ISBNを読み取ってください。
必ず以下のJSON形式のみで返してください（説明文なし）:
{"title":"書籍タイトル","authors":["著者名1","著者名2"],"isbn":"ISBN番号またはnull"}
ISBNが読み取れない場合はnullにしてください。著者が不明な場合は空配列にしてください。`,
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AIからの応答をパースできませんでした');

  return JSON.parse(jsonMatch[0]);
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
