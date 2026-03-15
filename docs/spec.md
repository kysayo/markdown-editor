## 特徴的な機能

- 軽量である

- Windows標準のメモ帳に似たシンプルな表示で、任意のサイズのウィンドウで表示ができる機能を持つ。複雑な表示機能は切り替える事で行う。

- リアルタイムプレビュー（WYSIWYG）モードと、素のテキストモードの切り替えができる

- 以下はMarkTextと同じ機能を目指す

  - [CommonMark Spec](https://spec.commonmark.org/0.29/)、[GitHub Flavored Markdown Spec](https://github.github.com/gfm/)をサポートし、[Pandoc Markdownを](https://pandoc.org/MANUAL.html#pandocs-markdown)選択的にサポートする。

  - 数式（KaTeX）、前付け、絵文字などのMarkdown拡張機能。

  - 段落分けやインラインスタイルのショートカットをサポートする。

  - **HTMLファイル**と**PDF**ファイルを出力できる。

  - クリップボードから画像を直接貼り付けることができる。

- （その他、専用の左右のペインなど決まったら書く）



## 技術スタック

| 役割 | 技術 |
|------|------|
| デスクトップフレームワーク | Tauri 2.x |
| UIライブラリ | React 19 + TypeScript |
| ビルドツール | Vite |
| WYSIWYGエディターコア | Milkdown 7.x |
| スタイリング | Tailwind CSS 4.x |
| 状態管理 | Zustand |
| 数式レンダリング | KaTeX |
| PDF/HTML出力 | Tauri webview Print API |



## フォルダ構成

```
markdown-editor/
├── src-tauri/          # Rustバックエンド
├── src/                # Reactフロントエンド
│   ├── App.tsx         # メインエディター画面
│   ├── App.css         # スタイル
│   └── main.tsx
├── docs/spec.md
├── .mise.toml
└── package.json
```

## ビルド方法

```powershell
pnpm tauri dev    # 開発
pnpm tauri build  # リリースビルド
```



## 参考にする場合のMarktextのWebページ

参考にするよう指示が出たときは、以下のページを参照する。
[GitHub - marktext/marktext: 📝A simple and elegant markdown editor, available for Linux, macOS and Windows. · GitHub](https://github.com/marktext/marktext)
