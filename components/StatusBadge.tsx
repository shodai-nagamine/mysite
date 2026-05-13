import { ReadingStatus } from '@/lib/supabase';

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  wishlist: '欲しい！',
  want: '積読',
  reading: '読書中',
  done: '読了',
};

const statusStyles: Record<ReadingStatus, string> = {
  wishlist: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
  want: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  reading: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
};

export function normalizeReadingStatus(status?: string | null): ReadingStatus {
  if (status === 'wishlist' || status === 'reading' || status === 'done') return status;
  return 'want';
}

interface StatusBadgeProps {
  status?: string | null;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = normalizeReadingStatus(status);

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[normalized]}`}>
      {READING_STATUS_LABELS[normalized]}
    </span>
  );
}
