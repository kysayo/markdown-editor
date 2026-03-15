import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export type FormatType =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "highlight"
  | "superscript"
  | "subscript"
  | "link"
  | "image";

export interface SelectionInfo {
  rect: { top: number; bottom: number; left: number; right: number };
  activeMarks: Set<string>;
}

interface FloatingToolbarProps {
  selectionInfo: SelectionInfo | null;
  onFormat: (type: FormatType, attrs?: Record<string, string>) => void;
}

const TOOLBAR_HEIGHT = 36;
const TOOLBAR_WIDTH = 316;
const LINK_INPUT_WIDTH = 320;

const buttons: {
  type: FormatType;
  label: string;
  title: string;
  markName?: string;
  className?: string;
}[] = [
  { type: "bold", label: "B", title: "太字 (B)", markName: "strong", className: "ftb-bold" },
  { type: "italic", label: "I", title: "イタリック (I)", markName: "emphasis", className: "ftb-italic" },
  { type: "strike", label: "S", title: "取り消し線 (S)", markName: "strike_through", className: "ftb-strike" },
  { type: "code", label: "</>", title: "インラインコード", markName: "inlineCode", className: "ftb-code" },
  { type: "highlight", label: "H", title: "ハイライト", markName: "mark", className: "ftb-highlight" },
  { type: "superscript", label: "A²", title: "上付き文字", markName: "superscript" },
  { type: "subscript", label: "A₂", title: "下付き文字", markName: "subscript" },
  { type: "link", label: "⛓", title: "リンク", markName: "link" },
  { type: "image", label: "⊞", title: "画像" },
];

export function FloatingToolbar({ selectionInfo, onFormat }: FloatingToolbarProps) {
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // キーボードフォーカス中のボタンインデックス（null = 非アクティブ）
  const [kbIdx, setKbIdx] = useState<number | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // stale closure を避けるための ref
  const kbIdxRef = useRef<number | null>(null);
  const selectionInfoRef = useRef(selectionInfo);
  const onFormatRef = useRef(onFormat);
  useEffect(() => { selectionInfoRef.current = selectionInfo; });
  useEffect(() => { onFormatRef.current = onFormat; });

  const updateKbIdx = useCallback((val: number | null) => {
    kbIdxRef.current = val;
    setKbIdx(val);
  }, []);

  // selectionInfo が消えたら URL入力・kbナビをリセット
  useEffect(() => {
    if (!selectionInfo) {
      setLinkInputOpen(false);
      updateKbIdx(null);
    }
  }, [selectionInfo, updateKbIdx]);

  // URL入力が開いたら kbナビをリセット & フォーカス
  useEffect(() => {
    if (linkInputOpen) {
      updateKbIdx(null);
      setTimeout(() => linkInputRef.current?.focus(), 0);
    }
  }, [linkInputOpen, updateKbIdx]);

  // Alt キーによるキーボードナビゲーション
  useEffect(() => {
    if (!selectionInfo || linkInputOpen) return;
    const count = buttons.length;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt 単体でナビ開/閉切り替え
      if (e.key === "Alt" && !e.repeat) {
        e.preventDefault();
        updateKbIdx(kbIdxRef.current === null ? 0 : null);
        return;
      }

      const idx = kbIdxRef.current;
      if (idx === null) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          updateKbIdx((idx + 1) % count);
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          updateKbIdx((idx - 1 + count) % count);
          break;
        case "Enter": {
          e.preventDefault();
          e.stopPropagation();
          const btn = buttons[idx];
          if (btn.type === "link") {
            if (selectionInfoRef.current?.activeMarks.has("link")) {
              onFormatRef.current("link");
            } else {
              setLinkUrl("");
              setLinkInputOpen(true);
            }
          } else {
            onFormatRef.current(btn.type);
          }
          updateKbIdx(null);
          break;
        }
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          updateKbIdx(null);
          break;
      }
    };

    // capture: true でProseMirrorより先にイベントを捕捉する
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [selectionInfo, linkInputOpen, updateKbIdx]);

  if (!selectionInfo) return null;

  const { rect, activeMarks } = selectionInfo;
  const currentWidth = linkInputOpen ? LINK_INPUT_WIDTH : TOOLBAR_WIDTH;
  const midX = (rect.left + rect.right) / 2;
  const left = Math.max(8, Math.min(midX - currentWidth / 2, window.innerWidth - currentWidth - 8));
  const topAbove = rect.top - TOOLBAR_HEIGHT - 8;
  const topBelow = rect.bottom + 8;
  const top = topAbove >= 8 ? topAbove : topBelow;

  const handleLinkButtonClick = () => {
    if (activeMarks.has("link")) {
      onFormat("link");
    } else {
      setLinkUrl("");
      setLinkInputOpen(true);
    }
  };

  const handleLinkConfirm = () => {
    const href = linkUrl.trim();
    if (href) {
      const normalizedHref = /^https?:\/\//i.test(href) ? href : `https://${href}`;
      onFormat("link", { href: normalizedHref });
    }
    setLinkInputOpen(false);
  };

  const toolbar = (
    <div className="floating-toolbar" style={{ top, left }}>
      {linkInputOpen ? (
        <>
          <input
            ref={linkInputRef}
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleLinkConfirm(); }
              if (e.key === "Escape") setLinkInputOpen(false);
            }}
            placeholder="URLを入力..."
            className="floating-toolbar-url-input"
          />
          <button
            className="floating-toolbar-btn ftb-confirm"
            title="確定"
            onMouseDown={(e) => { e.preventDefault(); handleLinkConfirm(); }}
          >
            ✓
          </button>
          <button
            className="floating-toolbar-btn ftb-cancel"
            title="キャンセル"
            onMouseDown={(e) => { e.preventDefault(); setLinkInputOpen(false); }}
          >
            ✗
          </button>
        </>
      ) : (
        buttons.map((btn, i) => {
          const isActive = btn.markName ? activeMarks.has(btn.markName) : false;
          const isKbFocused = kbIdx === i;
          return (
            <button
              key={btn.type}
              className={[
                "floating-toolbar-btn",
                btn.className ?? "",
                isActive ? "active" : "",
                isKbFocused ? "kb-focus" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={btn.title}
              onMouseDown={(e) => {
                e.preventDefault();
                updateKbIdx(null);
                if (btn.type === "link") {
                  handleLinkButtonClick();
                } else {
                  onFormat(btn.type);
                }
              }}
            >
              {btn.label}
            </button>
          );
        })
      )}
    </div>
  );

  return createPortal(toolbar, document.body);
}
