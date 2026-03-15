import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { getMarkdown, replaceAll, insert } from "@milkdown/kit/utils";
import { unemojify } from "node-emoji";
import { math } from "@milkdown/plugin-math";
import { emoji } from "@milkdown/plugin-emoji";
import { $prose } from "@milkdown/kit/utils";
import { gapCursor } from "@milkdown/kit/prose/gapcursor";
import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import "katex/dist/katex.min.css";
import "@milkdown/kit/prose/gapcursor/style/gapcursor.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import {
  remarkHighlight,
  highlightSchema,
  highlightInputRule,
  highlightStringifyHandlers,
} from "./plugins/highlight";
import {
  remarkSupersub,
  superscriptSchema,
  subscriptSchema,
  superscriptInputRule,
  subscriptInputRule,
  supersuperStringifyHandlers,
} from "./plugins/supersub";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import { useFileStore } from "./store/fileStore";
import "./App.css";

// フロントマター抽出ユーティリティ
const FRONTMATTER_RE = /^(---\n[\s\S]*?\n---)\n?/;
function extractFrontmatter(content: string): { fm: string; body: string } {
  const match = FRONTMATTER_RE.exec(content);
  if (match) {
    return { fm: match[1] + "\n", body: content.slice(match[0].length) };
  }
  return { fm: "", body: content };
}

// フロントマター表示・編集ブロック
function FrontMatterBlock({
  frontmatter,
  onChange,
}: {
  frontmatter: string;
  onChange: (raw: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.value = frontmatter
        .replace(/^---\n/, "")
        .replace(/\n---\n?$/, "");
    }
  }, [frontmatter]);

  return (
    <div className="frontmatter-block" style={{ display: frontmatter ? "block" : "none" }}>
      <div className="frontmatter-label">YAML Front Matter</div>
      <textarea
        ref={taRef}
        className="frontmatter-editor"
        onChange={(e) => onChange(`---\n${e.target.value}\n---\n`)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  );
}

interface EditorRef {
  getContent: () => string;
  setContent: (md: string) => void;
  insertContent: (md: string) => void;
}

function MilkdownEditor({
  editorRef,
  onDirty,
}: {
  editorRef: React.RefObject<EditorRef | null>;
  onDirty: () => void;
}) {
  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "");
        ctx.set(remarkStringifyOptionsCtx, {
          bullet: "-",
          handlers: {
            ...highlightStringifyHandlers,
            ...supersuperStringifyHandlers,
          } as any,
        });
        ctx.get(listenerCtx).markdownUpdated(() => {
          onDirty();
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(math)
      .use(emoji)
      .use(remarkHighlight)
      .use(highlightSchema)
      .use(highlightInputRule)
      .use(remarkSupersub)
      .use(superscriptSchema)
      .use(subscriptSchema)
      .use(superscriptInputRule)
      .use(subscriptInputRule)
      .use($prose(() => gapCursor()))
      .use($prose(() => new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos, _event, direct) {
            if (direct && node.type.name === "hr") {
              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos))
              );
              return true;
            }
            return false;
          },
        },
      })))
  );

  useEffect(() => {
    const editor = get();
    if (editor) {
      editorRef.current = {
        getContent: () => editor.action(getMarkdown()),
        setContent: (md: string) => editor.action(replaceAll(md)),
        insertContent: (md: string) => editor.action(insert(md)),
      };
    }
  });

  return <Milkdown />;
}

function App() {
  const editorRef = useRef<EditorRef | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadingRef = useRef(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [frontmatter, setFrontmatter] = useState("");
  const frontmatterRef = useRef("");
  const { currentPath, isDirty, setCurrentPath, setIsDirty } = useFileStore();

  const handleFrontmatterChange = useCallback((raw: string) => {
    frontmatterRef.current = raw;
  }, []);

  // ハンドラーを常に最新に保つ ref（メニュークロージャ用）
  const handlersRef = useRef({
    handleNew: () => {},
    handleOpen: async () => {},
    handleSave: async () => {},
    handleSaveAs: async () => {},
    handleToggleSource: () => {},
  });

  // CheckMenuItem の ref
  const toggleSourceItemRef = useRef<CheckMenuItem | null>(null);

  // ウィンドウタイトルを更新
  useEffect(() => {
    const name = currentPath ? currentPath.split(/[\\/]/).pop() : "無題";
    getCurrentWindow().setTitle(
      `${isDirty ? "* " : ""}${name} — Markdown Editor`
    );
  }, [currentPath, isDirty]);

  const handleDirty = useCallback(() => {
    if (!isLoadingRef.current) {
      setIsDirty(true);
    }
  }, [setIsDirty]);

  // 現在のモードに応じてコンテンツを取得（フロントマターを含む）
  const getCurrentContent = useCallback(() => {
    if (isSourceMode) {
      return textareaRef.current?.value ?? "";
    }
    return frontmatterRef.current + (editorRef.current?.getContent() ?? "");
  }, [isSourceMode]);

  const handleNew = useCallback(() => {
    isLoadingRef.current = true;
    frontmatterRef.current = "";
    setFrontmatter("");
    editorRef.current?.setContent("");
    if (textareaRef.current) textareaRef.current.value = "";
    setCurrentPath(null);
    setIsDirty(false);
    setIsSourceMode(false);
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [setCurrentPath, setIsDirty]);

  const handleOpen = useCallback(async () => {
    const selected = await open({
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "テキスト", extensions: ["txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (!selected) return;

    const content = await readTextFile(selected as string);
    const { fm, body } = extractFrontmatter(content);
    frontmatterRef.current = fm;
    setFrontmatter(fm);
    isLoadingRef.current = true;
    editorRef.current?.setContent(body);
    if (textareaRef.current) textareaRef.current.value = content;
    setCurrentPath(selected as string);
    setIsDirty(false);
    setIsSourceMode(false);
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [setCurrentPath, setIsDirty]);

  const handleSaveAs = useCallback(async () => {
    const content = getCurrentContent();
    const filePath = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "untitled.md",
    });
    if (!filePath) return;

    await writeTextFile(filePath, content);
    setCurrentPath(filePath);
    setIsDirty(false);
  }, [getCurrentContent, setCurrentPath, setIsDirty]);

  const handleSave = useCallback(async () => {
    if (currentPath) {
      await writeTextFile(currentPath, getCurrentContent());
      setIsDirty(false);
    } else {
      await handleSaveAs();
    }
  }, [currentPath, getCurrentContent, setIsDirty, handleSaveAs]);

  // WYSIWYGモード ↔ ソースモード切替
  const handleToggleSource = useCallback(() => {
    if (!isSourceMode) {
      // WYSIWYG → ソース：フロントマター + 本文をtextareaにセット
      // 空段落が <br /> にシリアライズされるので空行に置換する
      const rawMd = unemojify(editorRef.current?.getContent() ?? "");
      const md = rawMd.replace(/^<br\s*\/?>\s*$/gm, "");
      if (textareaRef.current) {
        textareaRef.current.value = frontmatterRef.current + md;
      }
      setIsSourceMode(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else {
      // ソース → WYSIWYG：フロントマターを再抽出して本文だけMilkdownへ
      const full = textareaRef.current?.value ?? "";
      const { fm, body } = extractFrontmatter(full);
      frontmatterRef.current = fm;
      setFrontmatter(fm);
      isLoadingRef.current = true;
      editorRef.current?.setContent(body);
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
      setIsSourceMode(false);
    }
  }, [isSourceMode]);

  // 画像ペースト処理
  const handleImagePaste = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const ext = file.type.split("/")[1] || "png";
    const filename = `image-${Date.now()}.${ext}`;

    let imagePath: string;
    if (currentPath) {
      const dir = currentPath.replace(/[\\/][^\\/]+$/, "");
      const imagesDir = `${dir}/images`;
      await mkdir(imagesDir, { recursive: true });
      await writeFile(`${imagesDir}/${filename}`, bytes);
      imagePath = `./images/${filename}`;
    } else {
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );
      imagePath = `data:${file.type};base64,${base64}`;
    }

    editorRef.current?.insertContent(`\n![](${imagePath})\n`);
    setIsDirty(true);
  }, [currentPath, setIsDirty]);

  // WYSIWYGモードでのペーストイベント（画像検出）
  useEffect(() => {
    if (isSourceMode) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImagePaste(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isSourceMode, handleImagePaste]);

  // ハンドラー ref を最新に保つ
  useEffect(() => {
    handlersRef.current = {
      handleNew,
      handleOpen,
      handleSave,
      handleSaveAs,
      handleToggleSource,
    };
  }, [handleNew, handleOpen, handleSave, handleSaveAs, handleToggleSource]);

  // JavaScript でメニューを構築（初回マウント時のみ）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        Menu,
        Submenu,
        MenuItem,
        PredefinedMenuItem,
        CheckMenuItem,
      } = await import("@tauri-apps/api/menu");

      const toggleItem = await CheckMenuItem.new({
        id: "toggle_source",
        text: "ソースモード(&T)",
        checked: false,
        accelerator: "Ctrl+/",
        action: () => handlersRef.current.handleToggleSource(),
      });

      const fileMenu = await Submenu.new({
        text: "ファイル(&F)",
        items: [
          await MenuItem.new({
            id: "new",
            text: "新規(&N)",
            accelerator: "Ctrl+N",
            action: () => handlersRef.current.handleNew(),
          }),
          await MenuItem.new({
            id: "open",
            text: "開く(&O)...",
            accelerator: "Ctrl+O",
            action: () => handlersRef.current.handleOpen(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "save",
            text: "上書き保存(&S)",
            accelerator: "Ctrl+S",
            action: () => handlersRef.current.handleSave(),
          }),
          await MenuItem.new({
            id: "save_as",
            text: "名前を付けて保存(&A)...",
            accelerator: "Ctrl+Shift+S",
            action: () => handlersRef.current.handleSaveAs(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "CloseWindow", text: "終了(&X)" }),
        ],
      });

      const viewMenu = await Submenu.new({
        text: "表示(&V)",
        items: [toggleItem],
      });

      const menu = await Menu.new({ items: [fileMenu, viewMenu] });

      if (!cancelled) {
        toggleSourceItemRef.current = toggleItem;
        await menu.setAsAppMenu();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Ctrl+/ キーボードショートカット（CheckMenuItemのacceleratorが機能しないため）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        handlersRef.current.handleToggleSource();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ソースモード切替時にメニューのチェックマークを更新
  useEffect(() => {
    toggleSourceItemRef.current?.setChecked(isSourceMode).catch(() => {});
  }, [isSourceMode]);

  return (
    <MilkdownProvider>
      <div className="app-container">
        <div className="editor-main">
          {/* WYSIWYGエディター：ソースモード時は非表示（アンマウントしない） */}
          <div style={{ display: isSourceMode ? "none" : "block", height: "100%" }}>
            <FrontMatterBlock frontmatter={frontmatter} onChange={handleFrontmatterChange} />
            <MilkdownEditor editorRef={editorRef} onDirty={handleDirty} />
          </div>
          {/* ソースエディター：常時マウント、WYSIWYGモード時は非表示 */}
          <textarea
            ref={textareaRef}
            className="source-editor"
            style={{ display: isSourceMode ? "block" : "none" }}
            onChange={() => handleDirty()}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        {/* ステータスバー */}
        <div className="status-bar">
          <span className="status-mode">
            {isSourceMode ? "ソースモード" : "WYSIWYGモード"}
          </span>
        </div>
      </div>
    </MilkdownProvider>
  );
}

export default App;
