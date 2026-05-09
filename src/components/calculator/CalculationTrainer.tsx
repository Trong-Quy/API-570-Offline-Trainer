import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calculator, Shuffle, CheckCircle, XCircle, ChevronRight, BookOpen, BarChart3 } from "lucide-react";
import { CALCULATORS } from "./definitions";
import type { CalcDefinition, CalcResult } from "../../types";

type Mode = "select" | "practice" | "result";

interface CalcStats {
  calcId: string;
  total: number;
  correct: number;
  accuracy: number;
}

export function CalculationTrainer() {
  const [selected, setSelected] = useState<CalcDefinition>(CALCULATORS[0]);
  const [mode, setMode] = useState<Mode>("select");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CalcResult | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [stats, setStats] = useState<CalcStats[]>([]);
  const [randomMode, setRandomMode] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const s = await invoke<CalcStats[]>("get_calc_stats");
      setStats(s);
    } catch { /* first run */ }
  };

  const startCalc = (calc: CalcDefinition, random = false) => {
    setSelected(calc);
    setRandomMode(random);
    const initial = random
      ? Object.fromEntries(Object.entries(calc.randomize()).map(([k, v]) => [k, String(v)]))
      : Object.fromEntries(calc.fields.map((f) => [f.key, ""]));
    setValues(initial);
    setResult(null);
    setUserAnswer("");
    setAnswered(false);
    setShowSteps(false);
    setMode("practice");
  };

  const compute = () => {
    const nums: Record<string, number> = {};
    for (const f of selected.fields) {
      const v = parseFloat(values[f.key] ?? "");
      if (isNaN(v)) { alert(`Enter a valid number for: ${f.label}`); return; }
      nums[f.key] = v;
    }
    const res = selected.compute(nums);
    setResult(res);

    if (randomMode && userAnswer.trim()) {
      const ua = parseFloat(userAnswer);
      const correct = !isNaN(ua) && Math.abs(ua - res.value) / res.value < 0.02; // within 2%
      setIsCorrect(correct);
      setAnswered(true);
      invoke("save_calc_attempt", {
        calcId: selected.id,
        inputs: JSON.stringify(nums),
        result: res.value,
        isCorrect: correct,
      }).then(loadStats).catch(() => {});
    } else {
      setAnswered(false);
      setIsCorrect(false);
    }
    setShowSteps(true);
  };

  const getStatFor = (id: string) => stats.find((s) => s.calcId === id);

  if (mode === "select") {
    return (
      <div className="h-full overflow-y-auto bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e5e5e5]">Calculation Trainer</h1>
            <p className="text-[#666] text-sm mt-1">API 570 / ASME B31.3 formula practice with step-by-step solutions</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {CALCULATORS.map((calc) => {
              const stat = getStatFor(calc.id);
              return (
                <div key={calc.id} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-[#e5e5e5] font-semibold">{calc.title}</h3>
                      <p className="text-[#555] text-xs mt-0.5">{calc.reference}</p>
                    </div>
                    {stat && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${stat.accuracy >= 70 ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#ef4444]/15 text-[#ef4444]"}`}>
                        {stat.accuracy}%
                      </span>
                    )}
                  </div>
                  <code className="block text-[#f5c842] text-xs bg-[#1a1a1a] px-3 py-2 rounded mb-4 font-mono">
                    {calc.formula}
                  </code>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startCalc(calc, false)}
                      className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] text-sm hover:border-[#f5c842]/30 hover:text-[#f5c842] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Calculator size={13} />
                      Open Calculator
                    </button>
                    <button
                      onClick={() => startCalc(calc, true)}
                      className="flex-1 py-2 rounded-lg bg-[#f5c842]/10 border border-[#f5c842]/30 text-[#f5c842] text-sm hover:bg-[#f5c842]/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Shuffle size={13} />
                      Random Quiz
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {stats.length > 0 && (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={14} className="text-[#818cf8]" />
                <h3 className="text-sm font-semibold text-[#e5e5e5]">Your Accuracy</h3>
              </div>
              <div className="space-y-2">
                {CALCULATORS.map((calc) => {
                  const stat = getStatFor(calc.id);
                  if (!stat) return null;
                  return (
                    <div key={calc.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#888]">{calc.title}</span>
                        <span className="text-[#aaa]">{stat.correct}/{stat.total} ({stat.accuracy}%)</span>
                      </div>
                      <div className="h-1.5 bg-[#1f1f1f] rounded-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${stat.accuracy}%`,
                            background: stat.accuracy >= 70 ? "#22c55e" : "#ef4444",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode("select")}
            className="text-[#666] hover:text-[#e5e5e5] text-sm transition-colors"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <h2 className="text-[#e5e5e5] font-semibold">{selected.title}</h2>
          {randomMode && <span className="text-[10px] bg-[#f5c842]/15 text-[#f5c842] px-2 py-0.5 rounded">Quiz Mode</span>}
        </div>

        {/* Formula reference */}
        <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={13} className="text-[#818cf8]" />
            <span className="text-[#818cf8] text-xs">{selected.reference}</span>
          </div>
          <code className="text-[#f5c842] font-mono text-sm">{selected.formula}</code>
        </div>

        {/* Input fields */}
        <div className="space-y-3">
          {selected.fields.map((field) => (
            <div key={field.key}>
              <label className="text-xs text-[#666] mb-1 block">
                {field.label} <span className="text-[#444]">({field.unit})</span>
                {field.hint && <span className="text-[#444] ml-1">— {field.hint}</span>}
              </label>
              <input
                type="number"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                min={field.min}
                max={field.max}
                step={field.step}
                className={`w-full bg-[#111] border rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842] transition-colors ${randomMode && !answered ? "border-[#2a2a2a]" : "border-[#2a2a2a]"}`}
                readOnly={randomMode}
              />
            </div>
          ))}
        </div>

        {/* Quiz answer input */}
        {randomMode && !answered && (
          <div>
            <label className="text-xs text-[#f5c842] mb-1 block">Your Answer</label>
            <input
              type="number"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Enter calculated result..."
              className="w-full bg-[#111] border border-[#f5c842]/40 rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
              onKeyDown={(e) => e.key === "Enter" && compute()}
              autoFocus
            />
          </div>
        )}

        <button
          onClick={randomMode ? (answered ? () => startCalc(selected, true) : compute) : compute}
          className="w-full py-3 rounded-xl bg-[#f5c842] text-black font-bold text-sm hover:bg-[#e5b832] transition-colors flex items-center justify-center gap-2"
        >
          {randomMode
            ? (answered ? <><Shuffle size={15} /> New Random Problem</> : <><ChevronRight size={15} /> Check Answer</>)
            : <><Calculator size={15} /> Calculate</>}
        </button>

        {/* Result */}
        {result && (
          <div className={`rounded-xl border p-5 ${answered
            ? isCorrect ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#ef4444]/40 bg-[#ef4444]/5"
            : "border-[#2a2a2a] bg-[#111]"
          }`}>
            {answered && (
              <div className="flex items-center gap-2 mb-3">
                {isCorrect
                  ? <><CheckCircle size={16} className="text-[#22c55e]" /><span className="text-[#22c55e] font-semibold text-sm">Correct!</span></>
                  : <><XCircle size={16} className="text-[#ef4444]" /><span className="text-[#ef4444] font-semibold text-sm">Incorrect — review the steps below</span></>}
              </div>
            )}

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold text-[#f5c842]">{result.value.toLocaleString()}</span>
              <span className="text-[#888] text-sm">{result.unit}</span>
            </div>

            {result.passLabel && (
              <div className={`text-xs font-medium mb-4 px-3 py-1.5 rounded-lg inline-block ${result.pass ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#ef4444]/15 text-[#ef4444]"}`}>
                {result.passLabel}
              </div>
            )}

            {/* Steps */}
            {showSteps && (
              <div>
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">Step-by-Step Solution</p>
                <div className="space-y-1">
                  {result.steps.map((step, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-[#444] shrink-0 w-4 text-right">{i + 1}.</span>
                      <span className={`font-mono ${step.startsWith("Note") ? "text-[#888] italic font-sans text-xs" : "text-[#aaa]"}`}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
