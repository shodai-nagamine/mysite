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

interface OpenBdSummary {
  isbn?: string;
  title?: string;
  author?: string;
  publisher?: string;
  pubdate?: string;
  cover?: string;
  volume?: string;
  series?: string;
}

interface OpenBdBook {
  summary?: OpenBdSummary;
  onix?: {
    CollateralDetail?: {
      TextContent?: Array<{ Text?: string }>;
    };
  };
}

function normalizeIsbn(value?: string | null) {
  return value?.replace(/[^0-9Xx]/g, '').toUpperCase() ?? '';
}

function decodeXmlEntities(value?: string | null) {
  if (!value) return null;

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTags(value?: string | null) {
  return decodeXmlEntities(value)?.replace(/<[^>]*>/g, '').trim() || null;
}

function extractFirstTag(xml: string, tag: string) {
  const decodedXml = decodeXmlEntities(xml) ?? xml;
  const match = decodedXml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return stripTags(match?.[1]);
}

function extractFirstTagBlock(xml: string, tag: string) {
  const decodedXml = decodeXmlEntities(xml) ?? xml;
  return decodedXml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;
}

function extractAllTags(xml: string, tag: string) {
  const decodedXml = decodeXmlEntities(xml) ?? xml;
  const matches = decodedXml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'));
  return Array.from(matches)
    .map((match) => stripTags(match[1]))
    .filter((value): value is string => Boolean(value));
}

function splitAuthors(value?: string | null) {
  if (!value) return [];

  return value
    .replace(/\s*(著|編著|編|監修|訳|監訳)\s*$/u, '')
    .split(/[、,／/]/u)
    .map((author) => author.trim())
    .filter(Boolean);
}

function parsePageCount(value?: string | null) {
  const firstNumber = value?.match(/\d+/)?.[0];
  return firstNumber ? Number(firstNumber) : null;
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

async function fetchOpenBd(isbn: string): Promise<Omit<Book, 'scan_method'> | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) return null;

  const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(normalizedIsbn)}`);
  if (!res.ok) return null;

  const data = (await res.json()) as Array<OpenBdBook | null>;
  const item = data[0];
  const summary = item?.summary;
  if (!summary?.title) return null;

  return {
    isbn: normalizeIsbn(summary.isbn) || normalizedIsbn,
    title: summary.title,
    authors: splitAuthors(summary.author),
    publisher: summary.publisher ?? null,
    published_date: summary.pubdate ?? null,
    description: item?.onix?.CollateralDetail?.TextContent?.[0]?.Text ?? null,
    cover_url: summary.cover ?? null,
    page_count: null,
    categories: [summary.series, summary.volume].filter((value): value is string => Boolean(value)),
    language: 'ja',
    raw_metadata: { source: 'openbd', data: item as unknown },
  };
}

async function fetchNdlSearch(isbn: string): Promise<Omit<Book, 'scan_method'> | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) return null;

  const query = `isbn="${normalizedIsbn}"`;
  const url = `https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&query=${encodeURIComponent(query)}&recordSchema=dcndl&maximumRecords=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const xml = await res.text();
  const recordCount = Number(extractFirstTag(xml, 'numberOfRecords') ?? 0);
  if (!recordCount) return null;

  const title = extractFirstTag(xml, 'dcterms:title') ?? extractFirstTag(xml, 'rdf:value');
  if (!title) return null;

  const creator = extractFirstTag(xml, 'dc:creator') ?? extractFirstTag(xml, 'foaf:name');
  const publisherBlock = extractFirstTagBlock(xml, 'dcterms:publisher');
  const publisher = publisherBlock ? extractFirstTag(publisherBlock, 'foaf:name') : null;
  const publishedDate = extractFirstTag(xml, 'dcterms:issued') ?? extractFirstTag(xml, 'dcterms:date');
  const extent = extractFirstTag(xml, 'dcterms:extent');
  const categories = extractAllTags(xml, 'rdf:value').filter((value) => value !== title).slice(0, 8);

  return {
    isbn: normalizedIsbn,
    title,
    authors: splitAuthors(creator),
    publisher,
    published_date: publishedDate,
    description: null,
    cover_url: null,
    page_count: parsePageCount(extent),
    categories,
    language: 'ja',
    raw_metadata: { source: 'ndlsearch', xml },
  };
}

async function fetchBookByIsbn(isbn: string): Promise<Omit<Book, 'scan_method'> | null> {
  return (
    (await fetchGoogleBooks(`isbn:${isbn}`)) ??
    (await fetchGoogleBooks(isbn)) ??
    (await fetchOpenBd(isbn)) ??
    (await fetchNdlSearch(isbn))
  );
}

async function fetchNdlByTitle(title: string, author?: string): Promise<Omit<Book, 'scan_method'> | null> {
  const query = author
    ? `title="${title}" AND creator="${author}"`
    : `title="${title}"`;
  const url = `https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&query=${encodeURIComponent(query)}&recordSchema=dcndl&maximumRecords=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const xml = await res.text();
  const recordCount = Number(extractFirstTag(xml, 'numberOfRecords') ?? 0);
  if (!recordCount) return null;

  const ndlTitle = extractFirstTag(xml, 'dcterms:title') ?? extractFirstTag(xml, 'rdf:value');
  if (!ndlTitle) return null;

  const creator = extractFirstTag(xml, 'dc:creator') ?? extractFirstTag(xml, 'foaf:name');
  const publisherBlock = extractFirstTagBlock(xml, 'dcterms:publisher');
  const publisher = publisherBlock ? extractFirstTag(publisherBlock, 'foaf:name') : null;
  const publishedDate = extractFirstTag(xml, 'dcterms:issued') ?? extractFirstTag(xml, 'dcterms:date');
  const extent = extractFirstTag(xml, 'dcterms:extent');
  const categories = extractAllTags(xml, 'rdf:value').filter((v) => v !== ndlTitle).slice(0, 8);

  // ISBNをXMLから抽出
  const isbnMatch = xml.match(/urn:isbn:([0-9Xx]+)/i);
  const isbn = isbnMatch ? isbnMatch[1].toUpperCase() : null;

  return {
    isbn,
    title: ndlTitle,
    authors: splitAuthors(creator),
    publisher,
    published_date: publishedDate,
    description: null,
    cover_url: null,
    page_count: parsePageCount(extent),
    categories,
    language: 'ja',
    raw_metadata: { source: 'ndlsearch-title', xml },
  };
}

async function enrichWithIsbn(book: Omit<Book, 'scan_method'>): Promise<Omit<Book, 'scan_method'>> {
  const isbn = normalizeIsbn(book.isbn);
  if (!isbn) return book;
  // OpenBD は日本語書籍の表紙・詳細が充実しているので優先的に補完
  const enriched = (await fetchOpenBd(isbn)) ?? (await fetchNdlSearch(isbn));
  if (!enriched) return book;
  return {
    ...enriched,
    // Google Books の表紙 URL が取れている場合は残す
    cover_url: enriched.cover_url ?? book.cover_url,
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
      bookData = await fetchBookByIsbn(isbn);
      scanMethod = 'barcode';
    } else if (imageBase64 && mimeType) {
      scanMethod = 'ai';
      const aiResult = await identifyByAI(imageBase64, mimeType);

      // ① AIがISBNを返した場合：各APIで完全取得
      if (aiResult.isbn) {
        bookData = await fetchBookByIsbn(aiResult.isbn);
      }

      // ② ISBNなし／取得失敗 → タイトルでGoogle Books検索
      if (!bookData && aiResult.title) {
        const searchQuery = aiResult.authors.length > 0
          ? `intitle:${aiResult.title} inauthor:${aiResult.authors[0]}`
          : `intitle:${aiResult.title}`;
        const googleResult = await fetchGoogleBooks(searchQuery);
        if (googleResult) {
          // Google BooksでISBNが取れたらOpenBD/NDLで日本語情報を補完
          bookData = await enrichWithIsbn(googleResult);
        }
      }

      // ③ Google Booksでも見つからない → NDLタイトル検索
      if (!bookData && aiResult.title) {
        const ndlResult = await fetchNdlByTitle(aiResult.title, aiResult.authors[0]);
        if (ndlResult) {
          // NDLでISBNが取れたらOpenBDで表紙・詳細を補完
          bookData = await enrichWithIsbn(ndlResult);
        }
      }

      // ④ 最終フォールバック：AIが取得したタイトル・著者のみ保存
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
    const msg = err instanceof Error ? err.message : '書籍の識別に失敗しました';
    console.error('[identify-book]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
