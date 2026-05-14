-- 既存データを削除（user_id なしデータは引き継がない）
DELETE FROM highlights;
DELETE FROM books;

-- books に user_id を追加
ALTER TABLE books
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;

-- highlights に user_id を追加
ALTER TABLE highlights
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;

-- books の既存 RLS ポリシーをすべて削除して再作成
DROP POLICY IF EXISTS "Anyone can insert books" ON books;
DROP POLICY IF EXISTS "Anyone can select books" ON books;
DROP POLICY IF EXISTS "Anyone can update books" ON books;
DROP POLICY IF EXISTS "Anyone can delete books" ON books;

CREATE POLICY "Users can insert own books"
ON books FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own books"
ON books FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own books"
ON books FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
ON books FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- highlights の既存 RLS ポリシーをすべて削除して再作成
DROP POLICY IF EXISTS "Anyone can insert highlights" ON highlights;
DROP POLICY IF EXISTS "Anyone can select highlights" ON highlights;
DROP POLICY IF EXISTS "Anyone can update highlights" ON highlights;
DROP POLICY IF EXISTS "Anyone can delete highlights" ON highlights;

CREATE POLICY "Users can insert own highlights"
ON highlights FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own highlights"
ON highlights FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own highlights"
ON highlights FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own highlights"
ON highlights FOR DELETE TO authenticated
USING (auth.uid() = user_id);
