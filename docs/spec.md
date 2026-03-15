# Markdown Editor 仕様書

## 目的・方針

MarkTextに似た**軽量WYSIWYGMarkdownエディター**をWindows向けに作成する。

### 設計方針

- **シンプルさ優先** — Windows標準メモ帳に近い見た目・操作感を目指す。複雑なUIパネルは最小限にする。
- **WYSIWYGが主、ソースが副** — 通常はWYSIWYGモードで使い、必要に応じてソースモードに切り替えられる。
- **Markdownファイルとの互換性** — 保存ファイルは素のMarkdown（`.md`）であり、他エディターで開いても問題ない形式を保つ。
- **軽量** — 起動が速く、リソース消費を抑える。不要な機能は追加しない。

---

## 特徴的な機能

### 実装済み

- **WYSIWYGモード** — Milkdownによるリアルタイムレンダリング（CommonMark + GFM）
- **ソースモード** — 素のMarkdownテキストを直接編集できる `<textarea>`
  - `表示(V)` メニュー → `ソースモード` または `Ctrl+/` で切替
  - ステータスバーで現在のモードを表示
  - モード切替時に内容を双方向同期（絵文字は `:smile:` 形式で往復する）
  - 空行はモード切替を往復しても保持される（`<br />` に変換されない）
- **ファイル操作** — 新規・開く・上書き保存・名前を付けて保存
  - キーボードショートカット: `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S`
  - ウィンドウタイトルに未保存マーク（`*`）とファイル名を表示
- **数式（KaTeX）** — インライン `$...$` とブロック `$$...$$`
- **絵文字** — `:smile:` 記法でtwemojiレンダリング
- **Markdown拡張** — GFM（テーブル、タスクリスト、打ち消し線など）
- **フロントマター** — YAML `---` ブロックの表示・編集（WYSIWYGモードでグレーブロック表示）
- **画像貼り付け** — クリップボードから `Ctrl+V` で貼り付け。保存済みなら `images/` フォルダに保存、未保存なら base64 埋め込み
- **脚注** — `[^1]: 注釈` 記法（GFMプリセットに含まれる）
- **ハイライト** — `==text==` で `<mark>` レンダリング（黄色背景）
- **上付き/下付き文字** — `^sup^` / `~sub~` で `<sup>` / `<sub>` レンダリング

### 実装予定（優先度高）

（現在、優先機能はすべて実装済み）

### 後回し（独自実装予定）

- テーマ切り替え（ライト/ダーク）
- タブ（複数ファイルを同時に開く）

### 将来の実装候補

- HTMLファイル出力（`ファイル > HTML として出力`）
- PDFファイル出力（`ファイル > PDF として出力`）— Tauri webview Print API を使用
- 未保存時に閉じようとした場合の確認ダイアログ

### 不採用（MarkTextにはあるが本プロジェクトでは不要と判断）

- タイプライターモード（カーソルを画面中央に固定）
- フォーカスモード（現在段落のみ強調）
- 文字数・段落数のリアルタイム表示

---

## 技術スタック

| 役割 | 技術 | 備考 |
|------|------|------|
| デスクトップフレームワーク | Tauri 2.x | Rustバックエンド |
| UIライブラリ | React 19 + TypeScript | |
| ビルドツール | Vite | |
| WYSIWYGエディターコア | Milkdown 7.x | ProseMirrorベース |
| Markdownパース/シリアライズ | unified / remark / remark-stringify | Milkdown内部で使用 |
| スタイリング | Tailwind CSS 4.x | |
| 状態管理 | Zustand | ファイルパス・ダーティ状態 |
| 数式レンダリング | KaTeX 0.16.x | `@milkdown/plugin-math` 経由 |
| 絵文字 | twemoji + node-emoji | `@milkdown/plugin-emoji` 経由 |
| PDF/HTML出力 | Tauri webview Print API | 未実装 |
| ネイティブメニュー | `@tauri-apps/api/menu`（JS構築） | CheckMenuItem でチェックマーク制御 |

---

## フォルダ構成

```
markdown-editor/
├── src-tauri/                  # Rustバックエンド
│   ├── src/
│   │   ├── lib.rs              # Tauriプラグイン登録のみ（メニューはJS側で構築）
│   │   └── main.rs
│   ├── capabilities/
│   │   └── default.json        # dialog / fs / core 権限
│   └── Cargo.toml
├── src/                        # Reactフロントエンド
│   ├── App.tsx                 # メインエディター画面・全ロジック
│   ├── App.css                 # スタイル（Tailwind + エディター固有CSS）
│   ├── main.tsx
│   └── store/
│       └── fileStore.ts        # Zustand: currentPath / isDirty
├── docs/
│   └── spec.md                 # 本ファイル
├── .mise.toml                  # node=24.13.0, pnpm=10.32.1
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 主要な実装パターン・注意点

### Milkdownのコンテンツ取得・設定

```ts
// 取得（Markdown文字列として得る）
editor.action(getMarkdown())

// 設定（Markdown文字列から再レンダリング）
editor.action(replaceAll(markdownString))
```

- `replaceAll` 実行前後に `isLoadingRef.current = true/false` をセットすることで、
  ロード中の `markdownUpdated` イベントによる誤ダーティ検知を防ぐ。

### モード切替の設計

- MilkdownとtextareaはどちらもDOMに**常時マウント**（`display: none` で非表示）する。
  アンマウントするとコンテンツが失われるため。
- WYSIWYG → ソース切替時: `getMarkdown()` → `unemojify()` → textarea にセット。
  `unemojify` で絵文字unicode（😄）を `:smile:` 記法に変換することでソースモードの可読性を確保。
- ソース → WYSIWYG切替時: textarea の値をそのまま `replaceAll()` に渡す。

### ネイティブメニューの構築

- メニューはRustではなく**JavaScriptの `@tauri-apps/api/menu`** で構築し `setAsAppMenu()` で設定する。
  理由：`CheckMenuItem` の checked 状態を JS 側から `setChecked()` で動的に更新するため。
- メニューaction内のクロージャは `handlersRef.current.xxx()` 経由で呼び出し、stale closure を回避する。

### remark-stringify の設定

```ts
ctx.set(remarkStringifyOptionsCtx, { bullet: "-" });
```

デフォルトでは `*` が使われるが、元の入力が `-` の場合に変わってしまう問題を防ぐため `-` 固定にする。

### 空行の保持（モード切替）

- `getMarkdown()` は空の段落ノードを `<br />` にシリアライズする。
- WYSIWYG → ソース切替時に正規表現でポストプロセスし、行単位の `<br />` を空行に置換する。

```ts
const md = rawMd.replace(/^<br\s*\/?>\s*$/gm, "");
```

- ソース → WYSIWYG方向は空行を remark/ProseMirror が段落区切りとして処理するので変換不要。

### gapcursor と非テキストノードの選択

- `prosemirror-gapcursor` プラグインを `$prose(() => gapCursor())` で追加。
  非テキストノード（`hr` など）の前後でカーソルが点滅表示される。
- `prosemirror-gapcursor/style/gapcursor.css` と `prosemirror-view/style/prosemirror.css` を
  インポートしないとカーソルが表示されない（`.ProseMirror-selectednode` スタイルも同様）。
- `hr` のマウスクリック選択は `handleClickOn` プロップで対応する。
  ProseMirror のデフォルトでは `hr` クリックが NodeSelection を作らないため手動ディスパッチが必要。

```ts
.use($prose(() => new Plugin({
  props: {
    handleClickOn(view, _pos, node, nodePos, _event, direct) {
      if (direct && node.type.name === "hr") {
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
        return true;
      }
    },
  },
})))
```

### Milkdown プラグイン互換性

- `@milkdown/plugin-math` は v7.5.9 で deprecated。ただし `@milkdown/utils@7.19.0` 等の
  peer dependencies を別途インストールすることで v7.19.0 環境でも動作する。
- `@milkdown/plugin-emoji` は v7.19.0 で最新。

---

## 開発サーバーの起動

```powershell
# PowerShellから実行
pnpm tauri dev
```

- 初回はRustコンパイルで5〜10分かかる。2回目以降はキャッシュで速い。
- **フロントエンド（src/）の変更はホットリロードで即反映**。Rustの再コンパイルは不要。
- **Rust側（src-tauri/）の変更は再起動が必要**。

## ビルド（リリース用）

```powershell
pnpm tauri build
```

`src-tauri/target/release/` 以下に実行ファイルが生成される。

---

---

## MarkText機能比較

2026-03-15時点でMarkTextと本プロジェクトの機能を比較し、実装方針を決定した。

| MarkText機能 | 本プロジェクト | 方針 |
|---|---|---|
| WYSIWYG / ソースモード切替 | ✅ 実装済み | — |
| 数式 (KaTeX) | ✅ 実装済み | — |
| 絵文字 | ✅ 実装済み | — |
| GFM拡張（テーブル・タスクリスト等） | ✅ 実装済み | — |
| フロントマター (YAML `---`) | ✅ 実装済み | — |
| 画像クリップボード貼り付け | ✅ 実装済み | — |
| 脚注 (`[^1]`) | ✅ 実装済み (GFM内包) | — |
| ハイライト (`==text==`) | ✅ 実装済み | — |
| 上付き/下付き (`^sup^`/`~sub~`) | ✅ 実装済み | — |
| テーマ切り替え | 未実装 | 後回し（独自実装） |
| タブ（複数ファイル） | 未実装 | 後回し（独自実装） |
| HTML/PDF出力 | 未実装 | 将来対応 |
| タイプライターモード | 未実装 | **不採用** |
| フォーカスモード | 未実装 | **不採用** |
| 文字数・段落数表示 | 未実装 | **不採用** |

---

## 参考

- [MarkText（参考にするエディター）](https://github.com/marktext/marktext)
- [Milkdown ドキュメント](https://milkdown.dev)
- [Tauri ドキュメント](https://tauri.app)
- [CommonMark Spec](https://spec.commonmark.org/0.29/)
- [GitHub Flavored Markdown Spec](https://github.github.com/gfm/)
