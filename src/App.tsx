import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";
import { unemojify } from "node-emoji";
import { math } from "@milkdown/plugin-math";
import { emoji } from "@milkdown/plugin-emoji";
import "katex/dist/katex.min.css";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import { useFileStore } from "./store/fileStore";
import "./App.css";

interface EditorRef {
  getContent: () => string;
  setContent: (md: string) => void;
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
        ctx.set(remarkStringifyOptionsCtx, { bullet: "-" });
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
  );

  useEffect(() => {
    const editor = get();
    if (editor) {
      editorRef.current = {
        getContent: () => editor.action(getMarkdown()),
        setContent: (md: string) => editor.action(replaceAll(md)),
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
  const { currentPath, isDirty, setCurrentPath, setIsDirty } = useFileStore();

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

  // 現在のモードに応じてコンテンツを取得
  const getCurrentContent = useCallback(() => {
    if (isSourceMode) {
      return textareaRef.current?.value ?? "";
    }
    return editorRef.current?.getContent() ?? "";
  }, [isSourceMode]);

  const handleNew = useCallback(() => {
    isLoadingRef.current = true;
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
    isLoadingRef.current = true;
    editorRef.current?.setContent(content);
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
      const md = unemojify(editorRef.current?.getContent() ?? "");
      if (textareaRef.current) {
        textareaRef.current.value = md;
      }
      setIsSourceMode(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else {
      const md = textareaRef.current?.value ?? "";
      isLoadingRef.current = true;
      editorRef.current?.setContent(md);
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
      setIsSourceMode(false);
    }
  }, [isSourceMode]);

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
