import { create } from "zustand";

interface SettingsState {
  headingSpacing: number; // em単位 (0.3 〜 2.0)
  listSpacing: number;    // em単位 (0.0 〜 1.5)
  setHeadingSpacing: (v: number) => void;
  setListSpacing: (v: number) => void;
}

function loadSettings(): Pick<SettingsState, "headingSpacing" | "listSpacing"> {
  try {
    const stored = localStorage.getItem("md-editor-settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        headingSpacing: typeof parsed.headingSpacing === "number" ? parsed.headingSpacing : 0.9,
        listSpacing: typeof parsed.listSpacing === "number" ? parsed.listSpacing : 0.75,
      };
    }
  } catch { /* ignore */ }
  return { headingSpacing: 0.9, listSpacing: 0.75 };
}

function saveSettings(state: Pick<SettingsState, "headingSpacing" | "listSpacing">) {
  try {
    localStorage.setItem("md-editor-settings", JSON.stringify(state));
  } catch { /* ignore */ }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setHeadingSpacing: (v) => {
    set({ headingSpacing: v });
    saveSettings({ headingSpacing: v, listSpacing: get().listSpacing });
  },
  setListSpacing: (v) => {
    set({ listSpacing: v });
    saveSettings({ headingSpacing: get().headingSpacing, listSpacing: v });
  },
}));
