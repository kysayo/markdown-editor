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
- pnpm: `C:\Users\Kiyotoshi\AppData\Local\mise\installs\pnpm\10.32.1\pnpm.exe`

## 開発サーバーの起動

```powershell
# PowerShellから実行
cd D:\Project\markdown-editor
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

## 参考

- [MarkText（参考にするエディター）](https://github.com/marktext/marktext)
- [Milkdown ドキュメント](https://milkdown.dev)
- [Tauri ドキュメント](https://tauri.app)
