import { type Tab } from "./store/fileStore";
import { basename } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

function TabLabel({ tab }: { tab: Tab }) {
  const [label, setLabel] = useState<string>("無題");

  useEffect(() => {
    if (!tab.filePath) {
      setLabel("無題");
      return;
    }
    basename(tab.filePath).then(setLabel).catch(() => setLabel(tab.filePath!));
  }, [tab.filePath]);

  return (
    <span className="tab-label">
      {tab.isDirty && <span className="tab-dirty">*</span>}
      {label}
    </span>
  );
}

export function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  // タブが1枚の時は非表示
  if (tabs.length <= 1) return null;

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? "tab-active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <TabLabel tab={tab} />
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            title="タブを閉じる"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
