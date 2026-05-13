# Phase 3 仕様：購入体験・収益化

## 目標
アフィリエイト収益を得ながら、ユーザーがアプリ内で購入判断を完結できる体験を作る。

## アフィリエイト設計

### 楽天アフィリエイト
- 楽天アフィリエイトリンクの生成: `https://hb.afl.rakuten.co.jp/hgc/{affiliate_id}/?pc={url}`
- 成果報酬: 購入金額の約 1%

### Amazon アソシエイト
- PA API で取得した URL に `&tag={associate_id}` を付与
- 成果報酬: カテゴリ別（本は約 3%）

## 価格アラート

### フロー
```
ユーザーが希望価格を登録
  └─ alerts テーブルに保存
        │
Supabase cron（pg_cron）が1時間ごとに実行
  └─ 現在価格 ≤ 希望価格 → メール通知（Supabase Resend）
```

### DB スキーマ
```sql
CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_isbn     text NOT NULL,
  target_price  integer NOT NULL,  -- 円
  target_source text,              -- 'amazon' | 'rakuten' | 'any'
  user_email    text NOT NULL,
  triggered_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);
```

## 認証（Supabase Auth）

- Google / Apple ログイン
- 本棚・アラートをユーザーに紐付け
- RLS（Row Level Security）で自分のデータのみ閲覧可能

```sql
ALTER TABLE books ADD COLUMN user_id uuid REFERENCES auth.users;
ALTER TABLE alerts ADD COLUMN user_id uuid REFERENCES auth.users;
```

## PWA 化

```json
// public/manifest.json
{
  "name": "本スキャン",
  "short_name": "BookScan",
  "display": "standalone",
  "start_url": "/",
  "icons": [...]
}
```
- ホーム画面に追加でネイティブアプリ風
- カメラ起動が容易になる

## ウィッシュリスト共有

- `/wishlist/{uuid}` で公開URLを生成
- SNSシェアボタン（X / LINE）
- 他ユーザーから「プレゼントした」マークを付けられる

## 実装ファイル

```
app/api/alerts/route.ts          ← アラート登録・管理
supabase/functions/check-prices  ← cron で価格チェック
app/wishlist/[id]/page.tsx       ← 共有ウィッシュリスト
public/manifest.json             ← PWA設定
```
