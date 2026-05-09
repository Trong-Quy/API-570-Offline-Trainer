import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/sidebar/Sidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ExamEngine } from "./components/exam/ExamEngine";
import { PDFViewer } from "./components/pdf/PDFViewer";
import { Flashcards } from "./components/flashcards/Flashcards";
import { SearchView } from "./components/search/SearchView";
import { BookmarksView } from "./components/BookmarksView";
import { HistoryView } from "./components/HistoryView";
import { CalculationTrainer } from "./components/calculator/CalculationTrainer";
import { PracticalSimulator } from "./components/simulator/PracticalSimulator";
import { SettingsView } from "./components/settings/SettingsView";
import { AnalyticsView } from "./components/analytics/AnalyticsView";
import { NotesView } from "./components/notes/NotesView";
import { AIQuestionGenerator } from "./components/aigen/AIQuestionGenerator";

export default function App() {
  const { view, initApp, initialized } = useAppStore();

  useEffect(() => { initApp(); }, []);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#f5c842] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#f5c842] text-lg font-semibold">API 570 Trainer</p>
          <p className="text-[#888] text-sm mt-1">Initializing database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {view === "dashboard"  && <Dashboard />}
        {view === "exam"       && <ExamEngine />}
        {view === "pdf"        && <PDFViewer />}
        {view === "flashcards" && <Flashcards />}
        {view === "calculator" && <CalculationTrainer />}
        {view === "simulator"  && <PracticalSimulator />}
        {view === "analytics"  && <AnalyticsView />}
        {view === "notes"      && <NotesView />}
        {view === "aigen"      && <AIQuestionGenerator />}
        {view === "search"     && <SearchView />}
        {view === "bookmarks"  && <BookmarksView />}
        {view === "history"    && <HistoryView />}
        {view === "settings"   && <SettingsView />}
      </main>
    </div>
  );
}
