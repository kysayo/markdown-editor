import { useSettingsStore } from "./store/settingsStore";

interface Props {
  onClose: () => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function SettingsDialog({ onClose }: Props) {
  const { headingSpacing, listSpacing, tableCellPaddingV, tableIndent, setHeadingSpacing, setListSpacing, setTableCellPaddingV, setTableIndent } =
    useSettingsStore();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>表示設定</h2>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>見出しの余白</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="0.3"
                max="2.0"
                step="0.1"
                value={headingSpacing}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setHeadingSpacing(clamp(v, 0.3, 2.0));
                }}
              />
              <span className="settings-unit">em</span>
            </span>
          </div>
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.1"
            value={headingSpacing}
            onChange={(e) => setHeadingSpacing(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>箇条書きの余白</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="0.0"
                max="1.5"
                step="0.05"
                value={listSpacing}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setListSpacing(clamp(v, 0.0, 1.5));
                }}
              />
              <span className="settings-unit">em</span>
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.5"
            step="0.05"
            value={listSpacing}
            onChange={(e) => setListSpacing(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>表の行間</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="0.0"
                max="1.0"
                step="0.05"
                value={tableCellPaddingV}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setTableCellPaddingV(clamp(v, 0.0, 1.0));
                }}
              />
              <span className="settings-unit">em</span>
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={tableCellPaddingV}
            onChange={(e) => setTableCellPaddingV(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span>表のインデント</span>
            <span className="settings-number-wrap">
              <input
                type="number"
                className="settings-number-input"
                min="0.0"
                max="5.0"
                step="0.25"
                value={tableIndent}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setTableIndent(clamp(v, 0.0, 5.0));
                }}
              />
              <span className="settings-unit">em</span>
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="5.0"
            step="0.25"
            value={tableIndent}
            onChange={(e) => setTableIndent(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-footer">
          <button className="settings-close-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
