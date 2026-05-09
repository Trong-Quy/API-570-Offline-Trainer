import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Tag, BookOpen, AlertCircle } from "lucide-react";
import type { Question } from "../../types";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 1) doSearch();
      else setResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const doSearch = async () => {
    setLoading(true);
    try {
      const res = await invoke<Question[]>("search_questions", { query: query.trim() });
      setResults(res);
      setSelected(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const QUICK_SEARCHES = [
    "CUI", "corrosion rate", "remaining life", "MAWP", "hydrotest",
    "dead leg", "PWHT", "inspection interval", "HIC", "Class 1"
  ];

  return (
    <div className="h-full flex bg-[#0a0a0a]">
      {/* Left: search + results list */}
      <div className="w-80 flex flex-col border-r border-[#2a2a2a] bg-[#0f0f0f]">
        {/* Search input */}
        <div className="p-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5">
            <Search size={15} className="text-[#555]" />
            <input
              type="text"
              placeholder="Search questions, topics, clauses..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Quick searches */}
        {query.length === 0 && (
          <div className="p-4 border-b border-[#2a2a2a]">
            <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Quick Search</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SEARCHES.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="px-2 py-1 rounded-md bg-[#1a1a1a] text-[#888] text-xs hover:bg-[#2a2a2a] hover:text-[#e5e5e5] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center p-8">
              <div className="w-5 h-5 border-2 border-[#f5c842] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && results.length === 0 && query.length > 1 && (
            <div className="p-6 text-center text-[#444] text-sm">No results found</div>
          )}
          {results.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelected(q)}
              className={`w-full text-left px-4 py-3 border-b border-[#1a1a1a] transition-colors ${selected?.id === q.id ? "bg-[#f5c842]/8" : "hover:bg-[#ffffff05]"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  q.difficulty <= 2 ? "bg-[#22c55e]/15 text-[#22c55e]" :
                  q.difficulty === 3 ? "bg-[#f97316]/15 text-[#f97316]" :
                  "bg-[#ef4444]/15 text-[#ef4444]"
                }`}>
                  {["", "Easy", "Med", "Hard", "Expert", "Expert+"][q.difficulty]}
                </span>
                <span className="text-[#555] text-[10px]">{q.source_document}</span>
                {q.clause && <span className="text-[#444] text-[10px]">§{q.clause}</span>}
              </div>
              <p className="text-[#aaa] text-xs leading-relaxed line-clamp-2">{q.question_text}</p>
              <p className="text-[#555] text-[10px] mt-1">{q.topic}</p>
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div className="p-3 border-t border-[#2a2a2a] text-center text-[10px] text-[#444]">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Right: question detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Search size={40} className="text-[#2a2a2a] mb-4" />
            <p className="text-[#555] font-medium">Search the Question Bank</p>
            <p className="text-[#333] text-sm mt-1">Find questions by topic, clause, keyword</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-5">
            {/* Meta */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-[#818cf8]">
                <BookOpen size={12} /> {selected.source_document}
              </span>
              {selected.clause && (
                <span className="text-xs text-[#555]">Clause §{selected.clause}</span>
              )}
              <span className="text-xs text-[#888] bg-[#1a1a1a] px-2 py-0.5 rounded">{selected.topic}</span>
            </div>

            {/* Question */}
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
              <p className="text-[#555] text-xs uppercase tracking-wider mb-3">Question</p>
              <p className="text-[#e5e5e5] leading-relaxed">{selected.question_text}</p>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {(["A", "B", "C", "D"] as const).map((key) => {
                const text = selected[`option_${key.toLowerCase()}` as keyof Question] as string;
                const isCorrect = key === selected.correct_answer;
                return (
                  <div
                    key={key}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border ${isCorrect
                      ? "border-[#22c55e]/40 bg-[#22c55e]/8 text-[#22c55e]"
                      : "border-[#1f1f1f] bg-[#0f0f0f] text-[#555]"
                    }`}
                  >
                    <span className="font-bold text-sm w-5 shrink-0">{key}.</span>
                    <span className="text-sm">{text}</span>
                    {isCorrect && <span className="ml-auto text-xs font-semibold shrink-0">CORRECT</span>}
                  </div>
                );
              })}
            </div>

            {/* Explanation */}
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={13} className="text-[#f5c842]" />
                <span className="text-[#f5c842] text-xs font-semibold">Explanation</span>
              </div>
              <p className="text-[#aaa] text-sm leading-relaxed">{selected.explanation}</p>
            </div>

            {/* Tags */}
            {selected.tags && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag size={12} className="text-[#444]" />
                {selected.tags.split(",").map((tag) => (
                  <span key={tag} className="text-[10px] text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
