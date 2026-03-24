# Markdownエディター作成プロジェクト

marktextという既製品に似たMarkdownエディターを作成するプロジェクト。

## 技術スタック

- **フレームワーク**: Tauri 2.x + React 19 + Vite + TypeScript
- **エディターコア**: Milkdown 7.x（WYSIWYGエディター）
- **スタイリング**: Tailwind CSS 4.x
- **状態管理**: Zustand
- **数式**: KaTeX
- **パッケージマネージャー**: pnpm 10.32.1（mise管理）

## 開発環境

- Node.js v24.13.0（mise管理）
- Rust 1.94.0（~/.cargo/bin）
- pnpm 10.32.1（mise管理、`pnpm` コマンドで直接使用可能）

## 開発サーバーの起動

```powershell
# PowerShellから実行
cd E:\Projects\markdown-editor
pnpm tauri dev
```

初回はRustのコンパイルに5〜10分かかる。2回目以降はキャッシュで速い。

## フォルダ構成

```
markdown-editor/
├── src-tauri/          # Rustバックエンド
│   ├── src/main.rs
│   └── Cargo.toml
├── src/                # Reactフロントエンド
│   ├── App.tsx         # Milkdownエディターのメイン画面
│   ├── App.css         # Tailwind CSS + エディタースタイル
│   └── main.tsx
├── docs/
│   └── spec.md         # 機能仕様書
├── .mise.toml          # node=24.13.0, pnpm=10.32.1
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## ビルド（リリース用）

```powershell
pnpm tauri build
```

`src-tauri/target/release/` 以下に実行ファイルが生成される。

## Milkdown の内部 node/mark 名の調査方法

Milkdown の公式ドキュメントには ProseMirror の schema（node 名・mark 名）の一覧が記載されていない。
実装時に `schema.nodes.xxx` や `schema.marks.xxx` の名前が必要な場合は、以下の手順で確認する。

### 調査すべきタイミング

- ProseMirror コマンド（`setBlockType`, `toggleMark`, `wrapIn` など）で node/mark を指定するとき
- カスタムプラグインで `parseMarkdown.match` の `node.type` を判定するとき
- `schema.nodes.xxx` が `undefined` になるエラーが出たとき

### 調査方法

pnpm は実際のパッケージを `.pnpm/` 配下に展開している。以下のパスに実装ファイルがある：

```bash
# commonmark プリセットの node 名（paragraph, code_block, blockquote など）
node_modules/.pnpm/@milkdown+preset-commonmark@7.19.0/node_modules/@milkdown/preset-commonmark/lib/index.js

# GFM プリセットの node 名（table, table_row, table_header_row, table_header, table_cell など）
node_modules/.pnpm/@milkdown+preset-gfm@7.19.0/node_modules/@milkdown/preset-gfm/lib/index.js
```

grep で node/mark 名を検索する例：

```bash
grep -o '"[a-z_]*"' node_modules/.pnpm/@milkdown+preset-gfm@7.19.0/.../lib/index.js | sort -u
```

### 確認済みの主な node/mark 名

| プリセット | 種別 | 名前 |
|---|---|---|
| commonmark | node | `paragraph`, `code_block`, `blockquote`, `heading`, `hr`, `image`, `hardbreak` |
| commonmark | mark | `strong`, `emphasis`, `inline_code`, `link` |
| GFM | node | `table`, `table_header_row`, `table_row`, `table_header`, `table_cell` |
| GFM | mark | `strike_through` |
| カスタム | mark | `mark`（ハイライト）, `superscript`, `subscript`, `underline` |

GFM テーブルの構造: `table > table_header_row > table_header`（ヘッダー行）、`table > table_row > table_cell`（データ行）

## 参考

- [MarkText（参考にするエディター）](https://github.com/marktext/marktext)
- [Milkdown ドキュメント](https://milkdown.dev)
- [Tauri ドキュメント](https://tauri.app)
