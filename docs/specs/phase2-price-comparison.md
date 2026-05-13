# Phase 2 仕様：価格並列比較

## 目標
ISBNをもとに複数サービスの価格をリアルタイムで取得・比較する。

## API 比較

| サービス | 取得できる価格 | 認証 | 無料枠 |
|---|---|---|---|
| 楽天ブックス API | 新品・税込価格、楽天ポイント | アプリID（無料登録） | 1万req/日 |
| Amazon PA API | 新品・中古・マーケットプレイス最安 | アソシエイト登録（審査あり） | 1req/秒 |

### 中古・フリマ系（公式APIなし）
- メルカリ・ヤフオク・ブックオフ は公式APIなし → 対象外
- Amazon の「中古出品」で代替

## アーキテクチャ

```
[フロントエンド]
  POST /api/prices?isbn={ISBN}
        │
        ▼
[Next.js API Route: /api/prices]
  Promise.allSettled([
    fetchRakuten(isbn),
    fetchAmazon(isbn),
  ])
        │
        ▼
[レスポンス]
  {
    rakuten: { price, url, point, available },
    amazon:  { newPrice, usedPrice, url, available },
  }
```

## 価格キャッシュ（Supabase）

```sql
CREATE TABLE price_cache (
  isbn        text PRIMARY KEY,
  rakuten     jsonb,
  amazon      jsonb,
  fetched_at  timestamptz DEFAULT now()
);
```
TTL: 1時間（fetched_at + interval '1 hour' < now() で再取得）

## UI 仕様

```
[価格比較カード]
┌─────────────────────────────────┐
│ 📗 タイトル                      │
├─────────────────────────────────┤
│ 楽天ブックス  ¥1,980  +99pt  [購入]│
│ Amazon 新品  ¥1,782          [購入]│
│ Amazon 中古  ¥ 480 〜        [購入]│
└─────────────────────────────────┘
```
- 安い順にソート
- 在庫なし・取扱なしはグレーアウト

## 実装ファイル

```
app/api/prices/route.ts         ← 価格取得 API
lib/rakuten.ts                  ← 楽天APIクライアント
lib/amazon.ts                   ← Amazon PA APIクライアント
components/PriceComparison.tsx  ← 価格比較カード
```

## 必要な環境変数

```
RAKUTEN_APP_ID=...
AMAZON_ACCESS_KEY=...
AMAZON_SECRET_KEY=...
AMAZON_ASSOCIATE_TAG=...
AMAZON_REGION=us-east-1
```
