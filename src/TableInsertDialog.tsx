import { useEffect, useState } from "react";

interface Props {
  onClose: () => void;
  onInsert: (rows: number, cols: number) => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function TableInsertDialog({ onClose, onInsert }: Props) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  // Esc キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>テーブルを挿入</h2>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>行数</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="1"
                max="20"
                step="1"
                value={rows}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setRows(clamp(v, 1, 20));
                }}
              />
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>列数</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="1"
                max="20"
                step="1"
                value={cols}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setCols(clamp(v, 1, 20));
                }}
              />
            </span>
          </div>
        </div>

        <div className="settings-footer">
          <button
            className="settings-close-btn"
            onClick={() => onInsert(rows, cols)}
            style={{ marginRight: 8 }}
          >
            挿入
          </button>
          <button className="settings-close-btn" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
