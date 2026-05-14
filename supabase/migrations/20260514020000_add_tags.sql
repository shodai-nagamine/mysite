-- booksテーブルにtagsカラムを追加
ALTER TABLE books ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- タグ検索用のGINインデックス
CREATE INDEX IF NOT EXISTS books_tags_gin ON books USING GIN(tags);
