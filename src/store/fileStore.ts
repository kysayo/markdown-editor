import { create } from "zustand";

interface FileState {
  currentPath: string | null;
  isDirty: boolean;
  setCurrentPath: (path: string | null) => void;
  setIsDirty: (dirty: boolean) => void;
}

export const useFileStore = create<FileState>((set) => ({
  currentPath: null,
  isDirty: false,
  setCurrentPath: (path) => set({ currentPath: path }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
}));
