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
import { toggleMark } from "@milkdown/kit/prose/commands";
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
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import { useFileStore } from "./store/fileStore";
import { useSettingsStore } from "./store/settingsStore";
import { SettingsDialog } from "./SettingsDialog";
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
          // フォールバック用テキスト比率
          const textBefore = doc.textBetween(0, from, '\n');
          const totalText = doc.textBetween(0, doc.content.size, '\n');
          const ratio = totalText.length > 0 ? textBefore.length / totalText.length : 0;
          const MARKER = '«CURSOR»';
          try {
            // undoヒストリー対象外でマーカーをカーソール位置に挿入
            view.dispatch(view.state.tr
              .insertText(MARKER, from)
              .setMeta('addToHistory', false)
            );
            // マーカー付きmarkdownを取得
            const md = editor.action(getMarkdown());
            // マーカーを即座に削除（ヒストリー対象外）
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
          // ドキュメント内でマーカーテキストを検索
          let markerDocPos = -1;
          doc.descendants((node, pos) => {
            if (markerDocPos !== -1) return false;
            if (node.isText && node.text?.includes(marker)) {
              markerDocPos = pos + node.text.indexOf(marker);
              return false;
            }
          });
          if (markerDocPos !== -1) {
            // マーカーを削除してカーソールをその位置にセット（ヒストリー対象外）
            const tr = view.state.tr
              .delete(markerDocPos, markerDocPos + marker.length)
              .setMeta('addToHistory', false);
            try {
              tr.setSelection(TextSelection.create(tr.doc, markerDocPos));
            } catch { /* 削除後の位置が無効な場合は無視 */ }
            view.dispatch(tr.scrollIntoView());
          } else {
            // マーカーが見つからない場合はスクロールのみ
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
  const editorRef = useRef<EditorRef | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadingRef = useRef(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [frontmatter, setFrontmatter] = useState("");
  const frontmatterRef = useRef("");
  const { currentPath, isDirty, setCurrentPath, setIsDirty } = useFileStore();
  const { headingSpacing, listSpacing } = useSettingsStore();

  // CSS変数で余白をリアルタイム反映
  useEffect(() => {
    document.documentElement.style.setProperty("--heading-spacing", `${headingSpacing}em`);
    document.documentElement.style.setProperty("--list-spacing", `${listSpacing}em`);
  }, [headingSpacing, listSpacing]);

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
    handleOpenSettings: () => {},
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

  const handleSelectionChange = useCallback((info: SelectionInfo | null) => {
    setSelectionInfo(info);
  }, []);

  const handleFormat = useCallback((type: FormatType, attrs?: Record<string, string>) => {
    const view = editorRef.current?.getEditorView();
    if (!view) return;
    const { state, dispatch } = view;
    const { schema } = state;
    switch (type) {
      case "bold":
        toggleMark(schema.marks.strong)(state, dispatch);
        break;
      case "italic":
        toggleMark(schema.marks.emphasis)(state, dispatch);
        break;
      case "strike":
        toggleMark(schema.marks.strike_through)(state, dispatch);
        break;
      case "code":
        toggleMark(schema.marks.inlineCode)(state, dispatch);
        break;
      case "highlight":
        toggleMark(schema.marks.mark)(state, dispatch);
        break;
      case "superscript":
        toggleMark(schema.marks.superscript)(state, dispatch);
        break;
      case "subscript":
        toggleMark(schema.marks.subscript)(state, dispatch);
        break;
      case "link": {
        const linkMark = schema.marks.link;
        if (!linkMark) break;
        if (attrs?.href) {
          toggleMark(linkMark, { href: attrs.href, title: "" })(state, dispatch);
        } else {
          // hrefなし = リンク解除
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

  const handleLoadFile = useCallback(async (filePath: string) => {
    const content = await readTextFile(filePath);
    const { fm, body } = extractFrontmatter(content);
    frontmatterRef.current = fm;
    setFrontmatter(fm);
    isLoadingRef.current = true;
    editorRef.current?.setContent(body);
    if (textareaRef.current) textareaRef.current.value = content;
    setCurrentPath(filePath);
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
    await handleLoadFile(selected as string);
  }, [handleLoadFile]);

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
      // WYSIWYG → ソース：一時マーカーをカーソール位置に埋め込んでmarkdown内の正確な位置を取得
      // getCursorInfo 内の dispatch が markdownUpdated → onDirty() を呼ぶのを防ぐ
      isLoadingRef.current = true;
      const cursorInfo = editorRef.current?.getCursorInfo()
        ?? { markedMd: '', marker: '', ratio: 0 };
      isLoadingRef.current = false;

      // マーカー付きmarkdownを整形（空段落の <br /> を空行に置換）
      const rawMd = unemojify(cursorInfo.markedMd || (editorRef.current?.getContent() ?? ''));
      const cleanMd = rawMd.replace(/^<br\s*\/?>\s*$/gm, "");

      // マーカー位置を特定してマーカーを除去
      const markerIdx = cursorInfo.marker ? cleanMd.indexOf(cursorInfo.marker) : -1;
      let finalMd: string;
      let bodyOffset: number;
      if (markerIdx !== -1) {
        finalMd = cleanMd.slice(0, markerIdx) + cleanMd.slice(markerIdx + cursorInfo.marker.length);
        bodyOffset = markerIdx; // 正確な位置
      } else {
        finalMd = cleanMd;
        bodyOffset = Math.floor(cursorInfo.ratio * finalMd.length); // フォールバック
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
      // ソース → WYSIWYG：マーカーをカーソール位置に埋め込んでProseMirrorでカーソールを復元
      const MARKER = '«CURSOR»';
      const ta = textareaRef.current;
      const full = ta?.value ?? "";
      const cursorPos = ta?.selectionStart ?? 0;
      const { fm, body } = extractFrontmatter(full);
      frontmatterRef.current = fm;
      setFrontmatter(fm);
      // bodyの中でのカーソール位置（フロントマター分を引く）
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
      handleOpenSettings: () => setIsSettingsOpen(true),
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

  // .mdファイルのドラッグ&ドロップで開く
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const mdFile = event.payload.paths.find(p => p.toLowerCase().endsWith('.md'));
        if (mdFile) handleLoadFile(mdFile);
      }
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, [handleLoadFile]);

  // ソースモード切替時にメニューのチェックマークを更新
  useEffect(() => {
    toggleSourceItemRef.current?.setChecked(isSourceMode).catch(() => {});
  }, [isSourceMode]);

  return (
    <MilkdownProvider>
      {isSettingsOpen && <SettingsDialog onClose={() => setIsSettingsOpen(false)} />}
      <div className="app-container">
        <div className="editor-main">
          {/* WYSIWYGエディター：ソースモード時は非表示（アンマウントしない） */}
          <div style={{ display: isSourceMode ? "none" : "block", height: "100%" }}>
            <FrontMatterBlock frontmatter={frontmatter} onChange={handleFrontmatterChange} />
            <MilkdownEditor
              editorRef={editorRef}
              onDirty={handleDirty}
              onSelectionChange={handleSelectionChange}
            />
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
        {!isSourceMode && (
          <FloatingToolbar selectionInfo={selectionInfo} onFormat={handleFormat} />

        )}
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
