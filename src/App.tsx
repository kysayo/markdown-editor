import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx, editorViewCtx } from "@milkdown/kit/core";
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
import { NodeSelection, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { toggleMark, setBlockType, wrapIn, lift } from "@milkdown/kit/prose/commands";
import { FloatingToolbar, type SelectionInfo, type FormatType } from "./FloatingToolbar";
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
import { underlineSchema, underlineStringifyHandlers } from "./plugins/underline";
import { TableInsertDialog } from "./TableInsertDialog";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import { useTabStore, type Tab } from "./store/fileStore";
import { useSettingsStore } from "./store/settingsStore";
import { SettingsDialog } from "./SettingsDialog";
import { TabBar } from "./TabBar";
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
  getCursorInfo: () => { markedMd: string; marker: string; ratio: number };
  setCursorByMarker: (marker: string) => void;
  getEditorView: () => any;
}

function MilkdownEditor({
  editorRef,
  onDirty,
  onSelectionChange,
}: {
  editorRef: React.RefObject<EditorRef | null>;
  onDirty: () => void;
  onSelectionChange: (info: SelectionInfo | null) => void;
}) {
  const selectionCallbackRef = useRef(onSelectionChange);
  useEffect(() => { selectionCallbackRef.current = onSelectionChange; });

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
            ...underlineStringifyHandlers,
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
      .use(underlineSchema)
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
      .use($prose(() => new Plugin({
        view: () => ({
          update: (view, prevState) => {
            if (view.state.selection.eq(prevState.selection)) return;
            const { from, to } = view.state.selection;
            if (from === to || !(view.state.selection instanceof TextSelection)) {
              selectionCallbackRef.current(null);
              return;
            }
            const startCoords = view.coordsAtPos(from);
            const endCoords = view.coordsAtPos(to);
            const activeMarks = new Set<string>();
            const marks = view.state.storedMarks ?? view.state.selection.$from.marks();
            marks.forEach((m) => activeMarks.add(m.type.name));
            selectionCallbackRef.current({
              rect: {
                top: startCoords.top,
                bottom: Math.max(startCoords.bottom, endCoords.bottom),
                left: Math.min(startCoords.left, endCoords.left),
                right: Math.max(startCoords.right, endCoords.right),
              },
              activeMarks,
            });
          },
        }),
      })))
  );

  useEffect(() => {
    const editor = get();
    if (editor) {
      editorRef.current = {
        getContent: () => editor.action(getMarkdown()),
        setContent: (md: string) => editor.action(replaceAll(md)),
        insertContent: (md: string) => editor.action(insert(md)),
        getCursorInfo: () => editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { from } = view.state.selection;
          const doc = view.state.doc;
          const textBefore = doc.textBetween(0, from, '\n');
          const totalText = doc.textBetween(0, doc.content.size, '\n');
          const ratio = totalText.length > 0 ? textBefore.length / totalText.length : 0;
          const MARKER = '«CURSOR»';
          try {
            view.dispatch(view.state.tr
              .insertText(MARKER, from)
              .setMeta('addToHistory', false)
            );
            const md = editor.action(getMarkdown());
            view.dispatch(view.state.tr
              .delete(from, from + MARKER.length)
              .setMeta('addToHistory', false)
            );
            return { markedMd: md, marker: MARKER, ratio };
          } catch {
            return { markedMd: editor.action(getMarkdown()), marker: '', ratio };
          }
        }),
        getEditorView: () => editor.action((ctx) => ctx.get(editorViewCtx)),
        setCursorByMarker: (marker: string) => editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const doc = view.state.doc;
          let markerDocPos = -1;
          doc.descendants((node, pos) => {
            if (markerDocPos !== -1) return false;
            if (node.isText && node.text?.includes(marker)) {
              markerDocPos = pos + node.text.indexOf(marker);
              return false;
            }
          });
          if (markerDocPos !== -1) {
            const tr = view.state.tr
              .delete(markerDocPos, markerDocPos + marker.length)
              .setMeta('addToHistory', false);
            try {
              tr.setSelection(TextSelection.create(tr.doc, markerDocPos));
            } catch { /* 無効位置は無視 */ }
            view.dispatch(tr.scrollIntoView());
          } else {
            view.dispatch(view.state.tr.scrollIntoView());
          }
          (view.dom as HTMLElement).focus({ preventScroll: true });
        }),
      };
    }
  });

  return <Milkdown />;
}

function App() {
  // タブストア
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, updateTab, getActiveTab } = useTabStore();
  const activeTab = getActiveTab();

  // エディター関連 ref
  const editorRef = useRef<EditorRef | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadingRef = useRef(false);
  const frontmatterRef = useRef("");
  // tabs の最新値を非リアクティブに参照するための ref
  const tabsRef = useRef(tabs);
  // switchToTab が activeTabId 変化エフェクトの二重ロードを防ぐガード
  const tabSwitchingRef = useRef(false);

  // UI state
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [frontmatter, setFrontmatter] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const fontSizeRef = useRef(16);

  // ハンドラーを常に最新に保つ ref（メニュー・keydown クロージャ用）
  const handlersRef = useRef({
    handleNewWindow: async () => {},
    handleNewTab: () => {},
    handleCloseTab: async (_id?: string) => {},
    handleOpen: async () => {},
    handleSave: async () => {},
    handleSaveAs: async () => {},
    handleToggleSource: () => {},
    handleSwitchTabPrev: () => {},
    handleSwitchTabNext: () => {},
    handleOpenSettings: () => {},
    handleDragDropFile: async (_filePath: string) => {},
  });

  const toggleSourceItemRef = useRef<CheckMenuItem | null>(null);
  const { headingSpacing, listSpacing, tableCellPaddingV, tableIndent } = useSettingsStore();

  // tabsRef を最新に保つ
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // CSS 変数で余白をリアルタイム反映
  useEffect(() => {
    document.documentElement.style.setProperty("--heading-spacing", `${headingSpacing}em`);
    document.documentElement.style.setProperty("--list-spacing", `${listSpacing}em`);
    document.documentElement.style.setProperty("--table-cell-padding-v", `${tableCellPaddingV}em`);
    document.documentElement.style.setProperty("--table-indent", `${tableIndent}em`);
  }, [headingSpacing, listSpacing, tableCellPaddingV, tableIndent]);

  // フォントサイズ ref を最新に保つ
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  // CSS 変数でフォントサイズをリアルタイム反映
  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
  }, [fontSize]);

  // Ctrl+ホイール / Ctrl+0 でズーム
  useEffect(() => {
    const clampSize = (v: number) => Math.min(32, Math.max(10, v));
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      setFontSize(prev => clampSize(prev + delta));
    };
    const handleZoomKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setFontSize(prev => clampSize(prev + 1));
      } else if (e.key === '-') {
        e.preventDefault();
        setFontSize(prev => clampSize(prev - 1));
      } else if (e.key === '0') {
        e.preventDefault();
        setFontSize(16);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleZoomKey, { capture: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleZoomKey, { capture: true });
    };
  }, []);

  // ウィンドウタイトルをアクティブタブに合わせて更新
  useEffect(() => {
    const name = activeTab.filePath ? activeTab.filePath.split(/[\\/]/).pop() : "無題";
    getCurrentWindow().setTitle(`${activeTab.isDirty ? "* " : ""}${name} — Markdown Editor`);
  }, [activeTab.filePath, activeTab.isDirty]);

  const handleFrontmatterChange = useCallback((raw: string) => {
    frontmatterRef.current = raw;
  }, []);

  const handleSelectionChange = useCallback((info: SelectionInfo | null) => {
    setSelectionInfo(info);
  }, []);

  // 現在のモードに応じてエディターの内容を取得
  const getCurrentContent = useCallback(() => {
    if (isSourceMode) {
      return textareaRef.current?.value ?? "";
    }
    return frontmatterRef.current + (editorRef.current?.getContent() ?? "");
  }, [isSourceMode]);

  // アクティブタブをダーティとしてマーク
  const handleDirty = useCallback(() => {
    if (!isLoadingRef.current) {
      updateTab(activeTabId, { isDirty: true });
    }
  }, [updateTab, activeTabId]);

  // タブのコンテンツをエディターにロード（内部ヘルパー）
  const loadTabContent = useCallback((tab: Tab) => {
    isLoadingRef.current = true;
    if (tab.isSourceMode) {
      if (textareaRef.current) textareaRef.current.value = tab.savedContent;
      setIsSourceMode(true);
    } else {
      const { fm, body } = extractFrontmatter(tab.savedContent);
      frontmatterRef.current = fm;
      setFrontmatter(fm);
      editorRef.current?.setContent(body);
      setIsSourceMode(false);
    }
    setTimeout(() => { isLoadingRef.current = false; }, 0);
  }, []);

  // タブを切り替える（現在のタブを保存 → 新しいタブをロード）
  const switchToTab = useCallback((newTabId: string) => {
    if (newTabId === activeTabId) return;
    // 現在のタブの状態を保存
    updateTab(activeTabId, { savedContent: getCurrentContent(), isSourceMode });
    // 新しいタブを検索してロード
    // addTab() 直後は tabsRef.current が stale なので Zustand の同期 state も参照する
    const newTab = useTabStore.getState().tabs.find(t => t.id === newTabId)
               ?? tabsRef.current.find(t => t.id === newTabId);
    if (!newTab) return;
    tabSwitchingRef.current = true; // エフェクトの二重ロードを防ぐ
    loadTabContent(newTab);
    setActiveTab(newTabId);
  }, [activeTabId, getCurrentContent, isSourceMode, updateTab, loadTabContent, setActiveTab]);

  // activeTabId が変化した時（closeTab によるもの）に新しいアクティブタブをロード
  useEffect(() => {
    if (tabSwitchingRef.current) {
      tabSwitchingRef.current = false;
      return;
    }
    const tab = tabsRef.current.find(t => t.id === activeTabId);
    if (tab) loadTabContent(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // ファイルを現在のタブにロード
  const handleLoadFile = useCallback(async (filePath: string) => {
    const content = await readTextFile(filePath);
    const { fm, body } = extractFrontmatter(content);
    frontmatterRef.current = fm;
    setFrontmatter(fm);
    isLoadingRef.current = true;
    editorRef.current?.setContent(body);
    if (textareaRef.current) textareaRef.current.value = content;
    updateTab(activeTabId, { filePath, isDirty: false, savedContent: content, isSourceMode: false });
    setIsSourceMode(false);
    setTimeout(() => { isLoadingRef.current = false; }, 0);
  }, [activeTabId, updateTab]);

  // 新しいウィンドウを開く（Ctrl+N / Ctrl+Shift+N）
  const handleNewWindow = useCallback(async () => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    new WebviewWindow(`editor-${Date.now()}`, {
      url: "/",
      width: 800,
      height: 600,
      title: "Markdown Editor",
    });
  }, []);

  // 新しいタブを作成（Ctrl+T）
  const handleNewTab = useCallback(() => {
    const newTabId = addTab();
    switchToTab(newTabId);
  }, [addTab, switchToTab]);

  // タブを閉じる（Ctrl+W）
  const handleCloseTab = useCallback(async (tabId?: string) => {
    const id = tabId ?? activeTabId;
    // tabsRef は React の再レンダー後に更新されるため、常に Zustand の同期 state を参照する
    const currentTabs = useTabStore.getState().tabs;
    if (currentTabs.length === 1) {
      // 最後のタブ → アプリ終了
      await getCurrentWindow().close();
      return;
    }
    if (id === activeTabId) {
      // アクティブタブを閉じる場合：隣のタブをロード
      const idx = currentTabs.findIndex(t => t.id === id);
      const remaining = currentTabs.filter(t => t.id !== id);
      const newActiveTab = remaining[idx - 1] ?? remaining[0];
      tabSwitchingRef.current = true; // エフェクトの二重ロードを防ぐ
      closeTab(id);
      loadTabContent(newActiveTab);
    } else {
      closeTab(id);
    }
  }, [activeTabId, closeTab, loadTabContent]);

  // ファイルを開く（Ctrl+O）
  // アクティブタブが空なら上書き、そうでなければ新タブ
  const handleOpen = useCallback(async () => {
    const selected = await open({
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "テキスト", extensions: ["txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (!selected) return;
    const filePath = selected as string;
    const isEmpty = !activeTab.filePath && getCurrentContent().trim() === "";
    if (isEmpty) {
      await handleLoadFile(filePath);
    } else {
      const content = await readTextFile(filePath);
      const newTabId = addTab({ filePath, content });
      switchToTab(newTabId);
    }
  }, [activeTab.filePath, getCurrentContent, handleLoadFile, addTab, switchToTab]);

  // 名前を付けて保存
  const handleSaveAs = useCallback(async () => {
    const content = getCurrentContent();
    const filePath = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "untitled.md",
    });
    if (!filePath) return;
    await writeTextFile(filePath, content);
    updateTab(activeTabId, { filePath, isDirty: false, savedContent: content });
  }, [getCurrentContent, activeTabId, updateTab]);

  // 上書き保存
  const handleSave = useCallback(async () => {
    if (activeTab.filePath) {
      try {
        const content = getCurrentContent();
        await writeTextFile(activeTab.filePath, content);
        updateTab(activeTabId, { isDirty: false, savedContent: content });
      } catch (e) {
        console.error("handleSave failed:", e);
        alert(`保存に失敗しました:\n${e}`);
      }
    } else {
      await handleSaveAs();
    }
  }, [activeTab.filePath, getCurrentContent, activeTabId, updateTab, handleSaveAs]);

  // 前のタブに切り替え（Alt+←）
  const handleSwitchTabPrev = useCallback(() => {
    const allTabs = tabsRef.current;
    const idx = allTabs.findIndex(t => t.id === activeTabId);
    if (idx > 0) switchToTab(allTabs[idx - 1].id);
  }, [activeTabId, switchToTab]);

  // 次のタブに切り替え（Alt+→）
  const handleSwitchTabNext = useCallback(() => {
    const allTabs = tabsRef.current;
    const idx = allTabs.findIndex(t => t.id === activeTabId);
    if (idx < allTabs.length - 1) switchToTab(allTabs[idx + 1].id);
  }, [activeTabId, switchToTab]);

  // テーブル挿入
  const handleInsertTable = useCallback((rows: number, cols: number) => {
    const view = editorRef.current?.getEditorView();
    if (!view) return;
    const { state } = view;
    const { schema } = state;
    const tableNode = schema.nodes.table;
    const tableHeaderRowNode = schema.nodes.table_header_row;
    const tableRowNode = schema.nodes.table_row;
    const tableHeaderNode = schema.nodes.table_header;
    const tableCellNode = schema.nodes.table_cell;
    const paragraphNode = schema.nodes.paragraph;
    if (!tableNode || !tableHeaderRowNode || !tableRowNode || !tableHeaderNode || !tableCellNode) return;
    const headerCells = Array.from({ length: cols }, () =>
      tableHeaderNode.create(null, paragraphNode.create())
    );
    const headerRow = tableHeaderRowNode.create(null, headerCells);
    const bodyRows = Array.from({ length: rows - 1 }, () => {
      const cells = Array.from({ length: cols }, () =>
        tableCellNode.create(null, paragraphNode.create())
      );
      return tableRowNode.create(null, cells);
    });
    const table = tableNode.create(null, [headerRow, ...bodyRows]);
    view.dispatch(state.tr.replaceSelectionWith(table));
    setIsTableDialogOpen(false);
    view.focus();
  }, []);

  // フォーマット適用
  const handleFormat = useCallback((type: FormatType, attrs?: Record<string, string>) => {
    const view = editorRef.current?.getEditorView();
    if (!view) return;
    const { state, dispatch } = view;
    const { schema } = state;
    switch (type) {
      case "bold":   toggleMark(schema.marks.strong)(state, dispatch); break;
      case "italic": toggleMark(schema.marks.emphasis)(state, dispatch); break;
      case "strike": toggleMark(schema.marks.strike_through)(state, dispatch); break;
      case "code":   toggleMark(schema.marks.inlineCode)(state, dispatch); break;
      case "highlight": toggleMark(schema.marks.mark)(state, dispatch); break;
      case "superscript": toggleMark(schema.marks.superscript)(state, dispatch); break;
      case "subscript":   toggleMark(schema.marks.subscript)(state, dispatch); break;
      case "link": {
        const linkMark = schema.marks.link;
        if (!linkMark) break;
        if (attrs?.href) {
          toggleMark(linkMark, { href: attrs.href, title: "" })(state, dispatch);
        } else {
          toggleMark(linkMark)(state, dispatch);
        }
        break;
      }
      case "image": {
        const { from, to } = state.selection;
        const altText = state.doc.textBetween(from, to);
        const imageNode = schema.nodes.image?.create({ src: "", alt: altText, title: "" });
        if (imageNode) dispatch(state.tr.replaceSelectionWith(imageNode));
        break;
      }
    }
    view.focus();
  }, []);

  // WYSIWYGモード ↔ ソースモード切替
  const handleToggleSource = useCallback(() => {
    if (!isSourceMode) {
      isLoadingRef.current = true;
      const cursorInfo = editorRef.current?.getCursorInfo()
        ?? { markedMd: '', marker: '', ratio: 0 };
      isLoadingRef.current = false;

      const rawMd = unemojify(cursorInfo.markedMd || (editorRef.current?.getContent() ?? ''));
      const cleanMd = rawMd.replace(/^<br\s*\/?>\s*$/gm, "");

      const markerIdx = cursorInfo.marker ? cleanMd.indexOf(cursorInfo.marker) : -1;
      let finalMd: string;
      let bodyOffset: number;
      if (markerIdx !== -1) {
        finalMd = cleanMd.slice(0, markerIdx) + cleanMd.slice(markerIdx + cursorInfo.marker.length);
        bodyOffset = markerIdx;
      } else {
        finalMd = cleanMd;
        bodyOffset = Math.floor(cursorInfo.ratio * finalMd.length);
      }

      if (textareaRef.current) {
        textareaRef.current.value = frontmatterRef.current + finalMd;
      }
      setIsSourceMode(true);
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          const pos = frontmatterRef.current.length + bodyOffset;
          ta.focus();
          ta.setSelectionRange(pos, pos);
        }
      }, 0);
    } else {
      const MARKER = '«CURSOR»';
      const ta = textareaRef.current;
      const full = ta?.value ?? "";
      const cursorPos = ta?.selectionStart ?? 0;
      const { fm, body } = extractFrontmatter(full);
      frontmatterRef.current = fm;
      setFrontmatter(fm);
      const bodyOffset = Math.max(0, cursorPos - fm.length);
      const bodyWithMarker = body.slice(0, bodyOffset) + MARKER + body.slice(bodyOffset);
      isLoadingRef.current = true;
      editorRef.current?.setContent(bodyWithMarker);
      setIsSourceMode(false);
      setTimeout(() => {
        isLoadingRef.current = false;
        editorRef.current?.setCursorByMarker(MARKER);
      }, 50);
    }
  }, [isSourceMode]);

  // 画像ペースト処理
  const handleImagePaste = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const ext = file.type.split("/")[1] || "png";
    const filename = `image-${Date.now()}.${ext}`;

    let imagePath: string;
    if (activeTab.filePath) {
      const dir = activeTab.filePath.replace(/[\\/][^\\/]+$/, "");
      const imagesDir = `${dir}/images`;
      await mkdir(imagesDir, { recursive: true });
      await writeFile(`${imagesDir}/${filename}`, bytes);
      imagePath = `./images/${filename}`;
    } else {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      imagePath = `data:${file.type};base64,${base64}`;
    }

    editorRef.current?.insertContent(`\n![](${imagePath})\n`);
    updateTab(activeTabId, { isDirty: true });
  }, [activeTab.filePath, activeTabId, updateTab]);

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
      handleNewWindow,
      handleNewTab,
      handleCloseTab,
      handleOpen,
      handleSave,
      handleSaveAs,
      handleToggleSource,
      handleSwitchTabPrev,
      handleSwitchTabNext,
      handleOpenSettings: () => setIsSettingsOpen(true),
      handleDragDropFile: async (filePath: string) => {
        const activeTab = useTabStore.getState().getActiveTab();
        const isEmpty = !activeTab.filePath && getCurrentContent().trim() === "";
        if (isEmpty) {
          await handleLoadFile(filePath);
        } else {
          const content = await readTextFile(filePath);
          const newTabId = addTab({ filePath, content });
          switchToTab(newTabId);
        }
      },
    };
  }, [handleNewWindow, handleNewTab, handleCloseTab, handleOpen, handleSave, handleSaveAs,
      handleToggleSource, handleSwitchTabPrev, handleSwitchTabNext,
      handleLoadFile, getCurrentContent, addTab, switchToTab]);

  // タスクバー用ウィンドウアイコンをセット
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/icon-window.png');
        const bytes = new Uint8Array(await res.arrayBuffer());
        const icon = await TauriImage.fromBytes(bytes);
        await getCurrentWindow().setIcon(icon);
      } catch (e) {
        console.warn('setWindowIcon failed:', e);
      }
    })();
  }, []);

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
            id: "new_window",
            text: "新規ウィンドウ(&N)",
            accelerator: "Ctrl+N",
            action: () => handlersRef.current.handleNewWindow(),
          }),
          await MenuItem.new({
            id: "new_tab",
            text: "新しいタブ(&T)",
            accelerator: "Ctrl+T",
            action: () => handlersRef.current.handleNewTab(),
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
          await MenuItem.new({
            id: "close_tab",
            text: "タブを閉じる(&W)",
            accelerator: "Ctrl+W",
            action: () => handlersRef.current.handleCloseTab(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "CloseWindow", text: "終了(&X)" }),
        ],
      });

      const settingsItem = await MenuItem.new({
        id: "settings",
        text: "設定(&P)...",
        action: () => handlersRef.current.handleOpenSettings(),
      });

      const viewMenu = await Submenu.new({
        text: "表示(&V)",
        items: [
          toggleItem,
          await PredefinedMenuItem.new({ item: "Separator" }),
          settingsItem,
        ],
      });

      const menu = await Menu.new({ items: [fileMenu, viewMenu] });

      if (!cancelled) {
        toggleSourceItemRef.current = toggleItem;
        await menu.setAsAppMenu();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // キーボードショートカット（capture: true で ProseMirror より先に捕捉）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // --- ファイル操作・タブ操作（モード問わず）---
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        handlersRef.current.handleNewWindow();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handlersRef.current.handleNewWindow();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        handlersRef.current.handleNewTab();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        handlersRef.current.handleCloseTab();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'o') {
        e.preventDefault();
        handlersRef.current.handleOpen();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handlersRef.current.handleSaveAs();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        handlersRef.current.handleSave();
        return;
      }
      // Alt+←/→ でタブ切り替え
      if (e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlersRef.current.handleSwitchTabPrev();
        return;
      }
      if (e.altKey && !e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handlersRef.current.handleSwitchTabNext();
        return;
      }
      // Ctrl+/ → ソースモード切替
      if (e.ctrlKey && !e.shiftKey && e.key === '/') {
        e.preventDefault();
        handlersRef.current.handleToggleSource();
        return;
      }

      // 以下は WYSIWYGモード専用
      if (isSourceMode) return;
      const view = editorRef.current?.getEditorView();
      if (!view) return;
      const { state, dispatch } = view;
      const { schema } = state;

      if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault();
        toggleMark(schema.marks.strike_through)(state, dispatch);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'u') {
        e.preventDefault();
        toggleMark(schema.marks.underline)(state, dispatch);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        const { from, to } = state.selection;
        if (from !== to) {
          let tr = state.tr;
          Object.values(schema.marks).forEach((markType: any) => {
            tr = tr.removeMark(from, to, markType);
          });
          dispatch(tr);
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        const isCodeBlock = state.selection.$from.parent.type === schema.nodes.code_block;
        if (isCodeBlock) {
          setBlockType(schema.nodes.paragraph)(state, dispatch);
        } else {
          setBlockType(schema.nodes.code_block)(state, dispatch);
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        const inBlockquote = state.selection.$from.node(-1)?.type === schema.nodes.blockquote;
        if (inBlockquote) {
          lift(state, dispatch);
        } else {
          wrapIn(schema.nodes.blockquote)(state, dispatch);
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setIsTableDialogOpen(true);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        const tmp = document.createElement('textarea');
        tmp.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none;';
        document.body.appendChild(tmp);
        tmp.focus();
        const pasted = document.execCommand('paste');
        const text = tmp.value;
        tmp.remove();
        view.focus();
        if (pasted && text) {
          const { state: s, dispatch: d } = view;
          d(s.tr.insertText(text));
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isSourceMode]);

  // .mdファイルのドラッグ&ドロップで常に新タブで開く
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const mdFile = event.payload.paths.find(p => p.toLowerCase().endsWith('.md'));
        if (mdFile) handlersRef.current.handleDragDropFile(mdFile);
      }
    }).then(fn => {
      if (cancelled) fn(); // StrictMode の cleanup 後に解決された場合は即解除
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ソースモード切替時にメニューのチェックマークを更新
  useEffect(() => {
    toggleSourceItemRef.current?.setChecked(isSourceMode).catch(() => {});
  }, [isSourceMode]);

  return (
    <MilkdownProvider>
      {isSettingsOpen && <SettingsDialog onClose={() => setIsSettingsOpen(false)} />}
      {isTableDialogOpen && (
        <TableInsertDialog
          onClose={() => setIsTableDialogOpen(false)}
          onInsert={handleInsertTable}
        />
      )}
      <div className="app-container">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={switchToTab}
          onClose={(id) => handlersRef.current.handleCloseTab(id)}
        />
        <div className="editor-main">
          <div style={{ display: isSourceMode ? "none" : "block", height: "100%" }}>
            <FrontMatterBlock frontmatter={frontmatter} onChange={handleFrontmatterChange} />
            <MilkdownEditor
              editorRef={editorRef}
              onDirty={handleDirty}
              onSelectionChange={handleSelectionChange}
            />
          </div>
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
        {!isSourceMode && (
          <FloatingToolbar selectionInfo={selectionInfo} onFormat={handleFormat} />
        )}
        <div className="status-bar">
          <span className="status-mode">
            {isSourceMode ? "ソースモード" : "WYSIWYGモード"}
          </span>
          <span style={{ marginLeft: "auto" }}>{fontSize}px</span>
        </div>
      </div>
    </MilkdownProvider>
  );
}

export default App;
