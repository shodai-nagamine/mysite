import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ReadingStatus = 'wishlist' | 'want' | 'reading' | 'done';

export interface Book {
  id?: string;
  isbn?: string | null;
  title: string;
  authors: string[];
  publisher?: string | null;
  published_date?: string | null;
  description?: string | null;
  cover_url?: string | null;
  page_count?: number | null;
  categories: string[];
  language?: string | null;
  raw_metadata: Record<string, unknown>;
  scan_method: 'barcode' | 'ai';
  reading_status?: ReadingStatus | null;
  created_at?: string;
}
