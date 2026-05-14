-- API トークンテーブル（Obsidian プラグイン等の外部クライアント用）
CREATE TABLE IF NOT EXISTS api_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  name       text NOT NULL DEFAULT 'Obsidian Sync',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tokens"
  ON api_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
