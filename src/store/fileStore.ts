import { create } from "zustand";

export type Tab = {
  id: string;
  filePath: string | null;
  isDirty: boolean;
  savedContent: string; // 非アクティブ時のMarkdown内容
  isSourceMode: boolean;
};

function makeTab(opts?: { filePath?: string; content?: string }): Tab {
  return {
    id: crypto.randomUUID(),
    filePath: opts?.filePath ?? null,
    isDirty: false,
    savedContent: opts?.content ?? "",
    isSourceMode: false,
  };
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string;
  // Actions
  addTab: (opts?: { filePath?: string; content?: string }) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Omit<Tab, "id">>) => void;
  // Derived
  getActiveTab: () => Tab;
}

const initialTab = makeTab();

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,

  addTab: (opts) => {
    const tab = makeTab(opts);
    set((s) => ({ tabs: [...s.tabs, tab] }));
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 1) return; // 呼び出し元で終了処理
    const idx = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;
    if (activeTabId === id) {
      // 閉じたタブの隣（左優先）をアクティブに
      newActiveId = (newTabs[idx - 1] ?? newTabs[0]).id;
    }
    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  },
}));
