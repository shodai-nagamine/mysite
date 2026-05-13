# 本スキャン価格比較アプリ ロードマップ

## コンセプト

本の表紙を撮影するだけで書籍情報を自動取得し、Amazon・楽天などで最安値を並列比較、そのまま購入までできるアプリ。

---

## 現在地 v0.1 ✅

| 機能 | 状態 |
|---|---|
| 表紙撮影・アップロード（HEIC対応） | ✅ |
| バーコード（ISBN）スキャン | ✅ |
| AI認識（OpenAI Vision / Supabase Edge Function） | ✅ |
| Google Books API でメタデータ取得 | ✅ |
| Supabase に書籍データ保存 | ✅ |
| 書誌情報カード表示 | ✅ |

---

## システム全体像

```
[ユーザー]
  └─ スマホカメラ / ファイル選択
        │
        ▼
[フロントエンド: Next.js 16 / React]
  ├─ ZXing でバーコードスキャン（クライアント）
  ├─ HEIC → JPEG 変換（heic2any）
  └─ 価格比較 UI / 本棚画面
        │
        ▼
[API Routes: Next.js]
  ├─ POST /api/identify-book   → 書籍識別（ISBN or 画像）
  └─ POST /api/prices          → 価格並列取得（Phase 2〜）
        │
        ▼
[Supabase]
  ├─ books テーブル            → 書誌情報・スキャン履歴
  ├─ Edge Fn: identify-book-cover → OpenAI Vision で表紙認識
  └─ Edge Fn: get-prices       → 各サイトAPI並列呼び出し（Phase 2〜）
        │
        ▼
[外部 API]
  ├─ Google Books API          → 書誌メタデータ（無料）
  ├─ 楽天ブックス API           → 新品価格（無料・要登録）
  └─ Amazon PA API             → 新品・中古価格（要アソシエイト）
```

---

## ロードマップ

### Phase 1｜本棚 + 購入リンク
> **目標**: スキャンした本を管理して購入ページへ飛べる状態

- [ ] `/books` 本棚ページ（スキャン履歴一覧）
- [ ] 読書ステータス管理（積読 / 読書中 / 読了）
- [ ] Amazon・楽天への ISBN ベース購入リンクボタン
- [ ] タイトル・著者での検索・フィルター

詳細 → [docs/specs/phase1-bookshelf.md](./specs/phase1-bookshelf.md)

---

### Phase 2｜価格並列比較
> **目標**: 複数サービスの価格をリアルタイムで並べて比較できる

- [ ] 楽天ブックス API 連携（新品価格）
- [ ] Amazon PA API 連携（新品・中古・マーケットプレイス）
- [ ] Supabase Edge Function `get-prices` 実装（並列fetch）
- [ ] 価格比較カード UI（安い順ソート・中古フラグ）
- [ ] 価格キャッシュ（Supabase テーブル、TTL 1時間）

詳細 → [docs/specs/phase2-price-comparison.md](./specs/phase2-price-comparison.md)

---

### Phase 3｜購入体験・収益化
> **目標**: アプリ内で購入フローを完結させ、アフィリエイト収益を得る

- [ ] アフィリエイトリンク最適化（楽天・Amazon）
- [ ] 価格アラート（希望価格を登録 → Supabase cron → 通知）
- [ ] Supabase Auth 導入（マルチユーザー、本棚の個人化）
- [ ] ウィッシュリスト・共有機能
- [ ] PWA 化（ホーム画面追加、オフライン対応）

詳細 → [docs/specs/phase3-purchase.md](./specs/phase3-purchase.md)

---

## 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js 16, React, TypeScript | App Router |
| スタイリング | Tailwind CSS | |
| バーコード | @zxing/browser | クライアント処理 |
| HEIC変換 | heic2any | クライアント処理 |
| BaaS | Supabase | DB + Edge Functions + Auth |
| AI認識 | OpenAI gpt-4o Vision | Supabase シークレット利用 |
| 書誌API | Google Books API | 無料・無認証 |
| 価格API（予定）| 楽天ブックス API, Amazon PA API | Phase 2〜 |

---

## DB スキーマ（現在）

```sql
-- books: スキャンした書籍
CREATE TABLE books (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn          text,
  title         text NOT NULL,
  authors       text[],
  publisher     text,
  published_date text,
  description   text,
  cover_url     text,
  page_count    integer,
  categories    text[],
  language      text,
  raw_metadata  jsonb,
  scan_method   text,  -- 'barcode' | 'ai'
  created_at    timestamptz DEFAULT now()
);
```

Phase 2 以降で追加予定:
```sql
-- price_cache: 価格キャッシュ
-- reading_status: 読書ステータス
-- alerts: 価格アラート
-- users: Supabase Auth 連携
```
