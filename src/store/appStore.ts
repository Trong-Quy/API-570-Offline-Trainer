import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { View, UserStats, PDF, Bookmark, ExamSession, AppSettings, UserNote } from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  aiEndpoint: "http://localhost:11434",
  aiModel: "qwen2.5:7b",
  aiEnabled: true,
  examTimerSeconds: 90,
  darkMode: true,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("api570_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface AppState {
  view: View;
  setView: (v: View) => void;

  stats: UserStats | null;
  loadStats: () => Promise<void>;

  pdfs: PDF[];
  loadPdfs: () => Promise<void>;
  activePdf: PDF | null;
  setActivePdf: (pdf: PDF | null) => void;

  bookmarks: Bookmark[];
  loadBookmarks: () => Promise<void>;

  examHistory: ExamSession[];
  loadExamHistory: () => Promise<void>;

  notes: UserNote[];
  loadNotes: () => Promise<void>;

  initialized: boolean;
  initApp: () => Promise<void>;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  settings: AppSettings;
  saveSettings: (s: Partial<AppSettings>) => void;

  aiStatus: "checking" | "online" | "offline";
  checkAiStatus: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "dashboard",
  setView: (v) => set({ view: v }),

  stats: null,
  loadStats: async () => {
    try {
      const stats = await invoke<UserStats>("get_user_stats");
      set({ stats });
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  },

  pdfs: [],
  loadPdfs: async () => {
    try {
      const pdfs = await invoke<PDF[]>("get_pdfs");
      set({ pdfs });
    } catch (e) {
      console.error("Failed to load PDFs:", e);
    }
  },
  activePdf: null,
  setActivePdf: (pdf) => set({ activePdf: pdf }),

  bookmarks: [],
  loadBookmarks: async () => {
    try {
      const bookmarks = await invoke<Bookmark[]>("get_bookmarks");
      set({ bookmarks });
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
    }
  },

  examHistory: [],
  loadExamHistory: async () => {
    try {
      const examHistory = await invoke<ExamSession[]>("get_exam_history");
      set({ examHistory });
    } catch (e) {
      console.error("Failed to load exam history:", e);
    }
  },

  notes: [],
  loadNotes: async () => {
    try {
      const notes = await invoke<UserNote[]>("get_notes");
      set({ notes });
    } catch (e) {
      console.error("Failed to load notes:", e);
    }
  },

  initialized: false,
  initApp: async () => {
    if (get().initialized) return;
    try {
      await invoke("init_database");
      await invoke("seed_questions");
      await Promise.all([
        get().loadStats(),
        get().loadPdfs(),
        get().loadBookmarks(),
        get().loadExamHistory(),
        get().loadNotes(),
      ]);
      set({ initialized: true });
      get().checkAiStatus();
    } catch (e) {
      console.error("Failed to initialize app:", e);
      set({ initialized: true });
    }
  },

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  settings: loadSettings(),
  saveSettings: (partial) => {
    const next = { ...get().settings, ...partial };
    localStorage.setItem("api570_settings", JSON.stringify(next));
    set({ settings: next });
  },

  aiStatus: "checking",
  checkAiStatus: async () => {
    const { settings } = get();
    if (!settings.aiEnabled) { set({ aiStatus: "offline" }); return; }
    try {
      const res = await fetch(`${settings.aiEndpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      set({ aiStatus: res.ok ? "online" : "offline" });
    } catch {
      set({ aiStatus: "offline" });
    }
  },
}));
