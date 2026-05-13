ALTER TABLE books
ADD COLUMN IF NOT EXISTS reading_status text DEFAULT 'want'
CHECK (reading_status IN ('want', 'reading', 'done'));
