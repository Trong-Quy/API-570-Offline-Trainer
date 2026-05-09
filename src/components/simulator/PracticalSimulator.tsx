import { useState } from "react";
import { Wrench, ChevronRight, CheckCircle, XCircle, AlertTriangle, RotateCcw, BookOpen } from "lucide-react";
import { SCENARIOS } from "./scenarios";
import type { SimScenario, SimChoice } from "../../types";

type Phase = "list" | "scenario" | "result";

interface ChoiceResult {
  choice: SimChoice;
  scenario: SimScenario;
}

export function PracticalSimulator() {
  const [phase, setPhase] = useState<Phase>("list");
  const [current, setCurrent] = useState<SimScenario | null>(null);
  const [selected, setSelected] = useState<SimChoice | null>(null);
  const [history, setHistory] = useState<ChoiceResult[]>([]);

  const start = (scenario: SimScenario) => {
    setCurrent(scenario);
    setSelected(null);
    setPhase("scenario");
  };

  const choose = (choice: SimChoice) => {
    setSelected(choice);
    if (current) {
      setHistory((h) => [{ choice, scenario: current }, ...h].slice(0, 20));
    }
  };

  const totalScore = history.reduce((sum, r) => sum + r.choice.points, 0);
  const maxScore = history.reduce((sum, r) => sum + Math.max(...r.scenario.choices.map((c) => c.points)), 0);

  if (phase === "list") {
    return (
      <div className="h-full overflow-y-auto bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#e5e5e5]">Practical Inspection Simulator</h1>
              <p className="text-[#666] text-sm mt-1">Real-world field inspection scenarios — apply code knowledge to make decisions</p>
            </div>
            {history.length > 0 && (
              <div className="text-right">
                <p className="text-[#f5c842] font-bold text-xl">{totalScore}/{maxScore}</p>
                <p className="text-[#555] text-xs">Total score</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {SCENARIOS.map((scenario) => {
              const done = history.some((h) => h.scenario.id === scenario.id);
              const result = history.find((h) => h.scenario.id === scenario.id);
              return (
                <button
                  key={scenario.id}
                  onClick={() => start(scenario)}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl p-5 text-left hover:border-[#f5c842]/30 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done
                      ? result?.choice.correct ? "bg-[#22c55e]/15" : "bg-[#ef4444]/15"
                      : "bg-[#f5c842]/10"
                    }`}>
                      {done
                        ? result?.choice.correct
                          ? <CheckCircle size={18} className="text-[#22c55e]" />
                          : <XCircle size={18} className="text-[#ef4444]" />
                        : <Wrench size={18} className="text-[#f5c842]" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[#e5e5e5] font-semibold text-sm group-hover:text-[#f5c842] transition-colors">{scenario.title}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          scenario.difficulty === 1 ? "bg-[#22c55e]/15 text-[#22c55e]" :
                          scenario.difficulty === 2 ? "bg-[#f97316]/15 text-[#f97316]" :
                          "bg-[#ef4444]/15 text-[#ef4444]"
                        }`}>
                          {["", "Easy", "Medium", "Hard"][scenario.difficulty]}
                        </span>
                      </div>
                      <p className="text-[#666] text-xs leading-relaxed line-clamp-2">{scenario.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {scenario.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] text-[#555] bg-[#1a1a1a] px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                        {done && (
                          <span className="text-[10px] text-[#555] ml-auto">{result?.choice.points} pts</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#444] group-hover:text-[#f5c842] transition-colors shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
        <button onClick={() => setPhase("list")} className="text-[#666] hover:text-[#e5e5e5] text-sm transition-colors">
          ← Scenarios
        </button>
        <div className="w-px h-4 bg-[#2a2a2a]" />
        <span className="text-[#e5e5e5] text-sm font-medium truncate">{current.title}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Scenario description */}
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-[#f97316]" />
              <span className="text-[#f97316] text-xs font-semibold uppercase tracking-wider">Field Scenario</span>
            </div>
            <p className="text-[#e5e5e5] leading-relaxed text-sm">{current.description}</p>
          </div>

          {/* Findings */}
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-5">
            <h3 className="text-[#e5e5e5] text-xs font-semibold uppercase tracking-wider mb-3">Inspection Findings</h3>
            <ul className="space-y-1.5">
              {current.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#aaa]">
                  <span className="text-[#444] shrink-0 mt-0.5">→</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Context */}
          <div className="flex items-start gap-2 text-xs text-[#666] bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
            <BookOpen size={12} className="text-[#555] shrink-0 mt-0.5" />
            <p>{current.context}</p>
          </div>

          {/* Decision */}
          {!selected ? (
            <div>
              <h3 className="text-sm font-semibold text-[#e5e5e5] mb-3">What is your decision?</h3>
              <div className="space-y-3">
                {current.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => choose(choice)}
                    className="w-full text-left border border-[#2a2a2a] bg-[#111] rounded-xl p-4 hover:border-[#f5c842]/40 hover:bg-[#f5c842]/5 transition-all group"
                  >
                    <p className="text-[#e5e5e5] text-sm font-medium group-hover:text-[#f5c842] transition-colors">{choice.label}</p>
                    {choice.detail && (
                      <p className="text-[#666] text-xs mt-1 leading-relaxed">{choice.detail}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border p-5 ${selected.correct ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#ef4444]/40 bg-[#ef4444]/5"}`}>
              <div className="flex items-center gap-2 mb-4">
                {selected.correct
                  ? <><CheckCircle size={18} className="text-[#22c55e]" /><span className="text-[#22c55e] font-bold">Good Decision!</span></>
                  : <><XCircle size={18} className="text-[#ef4444]" /><span className="text-[#ef4444] font-bold">Incorrect Response</span></>
                }
                <span className={`ml-auto text-sm font-bold ${selected.correct ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {selected.points} pts
                </span>
              </div>

              <div className="mb-4">
                <p className="text-[#888] text-xs uppercase tracking-wider mb-1">Your choice</p>
                <p className="text-[#e5e5e5] text-sm font-medium">{selected.label}</p>
              </div>

              <div className="mb-4">
                <p className="text-[#888] text-xs uppercase tracking-wider mb-2">Outcome & Explanation</p>
                <p className="text-[#aaa] text-sm leading-relaxed">{selected.outcome}</p>
              </div>

              {selected.codeRef && (
                <div className="flex items-center gap-2 text-xs text-[#818cf8] bg-[#818cf8]/10 px-3 py-2 rounded-lg">
                  <BookOpen size={11} />
                  <span>{selected.codeRef}</span>
                </div>
              )}

              {/* Show correct answer if wrong */}
              {!selected.correct && (
                <div className="mt-4 pt-4 border-t border-[#ffffff10]">
                  <p className="text-[#888] text-xs uppercase tracking-wider mb-2">Best Answer</p>
                  {current.choices.filter((c) => c.points === Math.max(...current.choices.map((x) => x.points))).map((best) => (
                    <div key={best.id} className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-lg p-3">
                      <p className="text-[#22c55e] text-sm font-medium">{best.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setSelected(null); setPhase("list"); }}
                  className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-[#888] text-sm hover:border-[#3a3a3a] hover:text-[#e5e5e5] transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={13} />
                  Back to Scenarios
                </button>
                <button
                  onClick={() => { setSelected(null); start(current); }}
                  className="flex-1 py-2.5 rounded-xl bg-[#f5c842] text-black font-semibold text-sm hover:bg-[#e5b832] transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={13} />
                  Retry Scenario
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
