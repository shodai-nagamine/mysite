CREATE UNIQUE INDEX IF NOT EXISTS books_unique_normalized_isbn
ON books (regexp_replace(upper(isbn), '[^0-9X]', '', 'g'))
WHERE isbn IS NOT NULL AND regexp_replace(upper(isbn), '[^0-9X]', '', 'g') <> '';
