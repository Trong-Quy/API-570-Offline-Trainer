import {
  LayoutDashboard, BookOpen, FileText, Layers, Search,
  Bookmark, History, Settings, ChevronRight, Zap,
  Calculator, Wrench, Bot, BarChart3, StickyNote, Sparkles
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { View } from "../../types";

interface NavItem { icon: React.ElementType; label: string; view: View; group: string }

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard",    view: "dashboard",  group: "main" },
  { icon: Zap,             label: "Exam Mode",    view: "exam",       group: "main" },
  { icon: FileText,        label: "Codebook PDF", view: "pdf",        group: "main" },
  { icon: Layers,          label: "Flashcards",   view: "flashcards", group: "study" },
  { icon: Calculator,      label: "Calculations", view: "calculator", group: "study" },
  { icon: Wrench,          label: "Simulator",    view: "simulator",  group: "study" },
  { icon: StickyNote,      label: "Notes",        view: "notes",      group: "study" },
  { icon: Sparkles,        label: "AI Generator", view: "aigen",      group: "study" },
  { icon: BarChart3,       label: "Analytics",    view: "analytics",  group: "tools" },
  { icon: Search,          label: "Search",       view: "search",     group: "tools" },
  { icon: Bookmark,        label: "Bookmarks",    view: "bookmarks",  group: "tools" },
  { icon: History,         label: "Exam History", view: "history",    group: "tools" },
];

const GROUPS = [
  { key: "main",  label: null },
  { key: "study", label: "Study" },
  { key: "tools", label: "Tools" },
];

export function Sidebar() {
  const { view, setView, stats, aiStatus } = useAppStore();

  return (
    <aside className="w-56 flex flex-col border-r border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#f5c842] flex items-center justify-center shrink-0">
            <BookOpen size={16} className="text-black" />
          </div>
          <div>
            <p className="text-[#f5c842] font-bold text-sm leading-none">API 570</p>
            <p className="text-[#555] text-[10px] mt-0.5">Inspector Trainer</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1 overflow-y-auto">
        {GROUPS.map(({ key, label }) => {
          const items = NAV_ITEMS.filter(i => i.group === key);
          return (
            <div key={key}>
              {label && (
                <p className="px-4 pt-3 pb-1 text-[10px] text-[#3a3a3a] uppercase tracking-wider">{label}</p>
              )}
              {items.map(({ icon: Icon, label: itemLabel, view: v }) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors relative
                      ${active
                        ? "text-[#f5c842] bg-[#f5c842]/8"
                        : "text-[#777] hover:text-[#e5e5e5] hover:bg-[#ffffff06]"
                      }`}
                  >
                    {active && <span className="absolute left-0 top-0.5 bottom-0.5 w-0.5 bg-[#f5c842] rounded-r" />}
                    <Icon size={14} className={active ? "text-[#f5c842]" : ""} />
                    <span className="flex-1 text-left text-[13px]">{itemLabel}</span>
                    {active && <ChevronRight size={10} className="text-[#f5c842]/40" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* AI status */}
      <div className="px-4 py-1.5 border-t border-[#1a1a1a] flex items-center gap-2">
        <Bot size={11} className={aiStatus === "online" ? "text-[#22c55e]" : "text-[#333]"} />
        <span className="text-[10px] text-[#3a3a3a]">
          AI {aiStatus === "online" ? "online" : aiStatus === "checking" ? "checking…" : "offline"}
        </span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="border-t border-[#2a2a2a] px-4 py-2.5 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#444]">Exams</span>
            <span className="text-[#888]">{stats.total_exams}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#444]">Avg score</span>
            <span className={stats.avg_score >= 70 ? "text-[#22c55e]" : "text-[#ef4444]"}>
              {stats.avg_score.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Settings */}
      <button
        onClick={() => setView("settings")}
        className={`flex items-center gap-2.5 px-4 py-3 text-sm border-t border-[#2a2a2a] transition-colors
          ${view === "settings" ? "text-[#f5c842]" : "text-[#444] hover:text-[#888]"}`}
      >
        <Settings size={14} />
        <span className="text-[13px]">Settings</span>
      </button>
    </aside>
  );
}
