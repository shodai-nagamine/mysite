# Phase 1 仕様：本棚 + 購入リンク

## 目標
スキャンした本を一覧で管理でき、Amazon・楽天の購入ページへ飛べる状態にする。

## 画面構成

```
/          ← スキャン画面（現在実装済み）
/books     ← 本棚ページ（新規）
```

## /books ページ仕様

### 表示内容
- スキャン済み書籍の一覧（カード形式）
- 各カードに表紙・タイトル・著者・発行年・ステータスバッジ
- 購入リンクボタン（Amazon / 楽天）

### 購入リンク URL パターン
```
Amazon: https://www.amazon.co.jp/s?k={ISBN}
楽天:   https://books.rakuten.co.jp/search/?sitem={ISBN}
```
ISBN がない場合はタイトル検索にフォールバック:
```
Amazon: https://www.amazon.co.jp/s?k={title}+{author}
楽天:   https://books.rakuten.co.jp/search/?sitem={title}
```

### 読書ステータス
| 値 | 表示 |
|---|---|
| `want`    | 積読 📚 |
| `reading` | 読書中 📖 |
| `done`    | 読了 ✅ |

### フィルター・検索
- ステータスでフィルター（タブ切り替え）
- タイトル・著者名のテキスト検索

## DB 変更

```sql
ALTER TABLE books ADD COLUMN reading_status text DEFAULT 'want'
  CHECK (reading_status IN ('want', 'reading', 'done'));
```

## 実装ファイル

```
app/books/page.tsx          ← 本棚ページ
components/BookList.tsx     ← 書籍一覧コンポーネント
components/StatusBadge.tsx  ← ステータスバッジ
components/BuyButtons.tsx   ← Amazon/楽天リンクボタン
```
