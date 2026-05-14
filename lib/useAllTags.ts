import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAllTags(): string[] {
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('books')
      .select('tags')
      .then(({ data }) => {
        const set = new Set<string>();
        for (const row of data ?? []) {
          for (const tag of (row.tags as string[]) ?? []) set.add(tag);
        }
        setAllTags(Array.from(set).sort((a, b) => a.localeCompare(b, 'ja')));
      });
  }, []);

  return allTags;
}
