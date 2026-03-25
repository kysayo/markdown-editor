import { create } from "zustand";

interface SettingsState {
  headingSpacing: number;   // em単位 (0.3 〜 2.0)
  listSpacing: number;      // em単位 (0.0 〜 1.5)
  tableCellPaddingV: number; // em単位 (0.0 〜 1.0) テーブルセルの縦padding
  tableIndent: number;       // em単位 (0.0 〜 5.0) テーブルの左インデント
  setHeadingSpacing: (v: number) => void;
  setListSpacing: (v: number) => void;
  setTableCellPaddingV: (v: number) => void;
  setTableIndent: (v: number) => void;
}

function loadSettings(): Pick<SettingsState, "headingSpacing" | "listSpacing" | "tableCellPaddingV" | "tableIndent"> {
  try {
    const stored = localStorage.getItem("md-editor-settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        headingSpacing: typeof parsed.headingSpacing === "number" ? parsed.headingSpacing : 0.9,
        listSpacing: typeof parsed.listSpacing === "number" ? parsed.listSpacing : 0.75,
        tableCellPaddingV: typeof parsed.tableCellPaddingV === "number" ? parsed.tableCellPaddingV : 0.3,
        tableIndent: typeof parsed.tableIndent === "number" ? parsed.tableIndent : 0,
      };
    }
  } catch { /* ignore */ }
  return { headingSpacing: 0.9, listSpacing: 0.75, tableCellPaddingV: 0.3, tableIndent: 0 };
}

function saveSettings(state: Pick<SettingsState, "headingSpacing" | "listSpacing" | "tableCellPaddingV" | "tableIndent">) {
  try {
    localStorage.setItem("md-editor-settings", JSON.stringify(state));
  } catch { /* ignore */ }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setHeadingSpacing: (v) => {
    set({ headingSpacing: v });
    saveSettings({ ...get(), headingSpacing: v });
  },
  setListSpacing: (v) => {
    set({ listSpacing: v });
    saveSettings({ ...get(), listSpacing: v });
  },
  setTableCellPaddingV: (v) => {
    set({ tableCellPaddingV: v });
    saveSettings({ ...get(), tableCellPaddingV: v });
  },
  setTableIndent: (v) => {
    set({ tableIndent: v });
    saveSettings({ ...get(), tableIndent: v });
  },
}));
