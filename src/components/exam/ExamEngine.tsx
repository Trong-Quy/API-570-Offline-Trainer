import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Timer, ChevronRight, CheckCircle, XCircle, AlertCircle, RotateCcw, Trophy, Bot, FileText } from "lucide-react";
import type { Question, ExamAnswer, ExamMode, QuestionFilter } from "../../types";
import { useAppStore } from "../../store/appStore";
import { AIPanel } from "../ai/AIPanel";
import { DualPanelExam } from "./DualPanelExam";

type Phase = "config" | "active" | "results";

const TOPICS = [
  "All Topics", "Inspection Intervals", "Corrosion Rate Calculation", "Remaining Life Calculation",
  "CUI - Corrosion Under Insulation", "Dead Legs", "Damage Mechanisms - HIC", "PWHT Requirements",
  "Piping Circuit Classification", "Condition Monitoring Locations", "Injection Points",
  "NDE Methods - RT vs UT", "Hydrotest Pressure", "Repairs - Temporary Repairs",
  "MAWP Calculation", "Wall Thickness Calculation", "External Inspection",
];

const SOURCES = ["All Documents", "API 570", "API 571", "ASME B31.3"];

export function ExamEngine() {
  const { loadStats, loadExamHistory } = useAppStore();

  const [phase, setPhase] = useState<Phase>("config");
  const [mode, setMode] = useState<ExamMode>("timed");
  const [questionCount, setQuestionCount] = useState(20);
  const [topic, setTopic] = useState("All Topics");
  const [source, setSource] = useState("All Documents");
  const [difficulty, setDifficulty] = useState(0);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [questionStart, setQuestionStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const startExam = async () => {
    try {
      let qs: Question[];
      if (mode === "adaptive") {
        qs = await invoke<Question[]>("get_weak_topic_questions", { limit: questionCount });
        if (qs.length === 0) {
          // Fall back to random if no weak topic data yet
          qs = await invoke<Question[]>("get_questions", { filter: { limit: questionCount, shuffle: true } });
        }
      } else {
        const filter: QuestionFilter = {
          limit: questionCount,
          shuffle: true,
          topic: topic === "All Topics" ? undefined : topic,
          source_document: source === "All Documents" ? undefined : source,
          difficulty: difficulty === 0 ? undefined : difficulty,
        };
        qs = await invoke<Question[]>("get_questions", { filter });
      }
      if (qs.length === 0) {
        alert("No questions match the selected filters. Try different options.");
        return;
      }
      setQuestions(qs);
      setCurrent(0);
      setAnswers([]);
      setSelected(null);
      setConfirmed(false);
      setShowExplanation(false);
      setElapsed(0);
      setQuestionStart(Date.now());
      setPhase("active");
    } catch (e) {
      console.error("Failed to start exam:", e);
    }
  };

  const confirmAnswer = () => {
    if (!selected) return;
    setConfirmed(true);
    if (mode === "open-book" || mode === "practice") setShowExplanation(true);
  };

  const nextQuestion = useCallback(() => {
    if (!selected || !confirmed) return;
    const q = questions[current];
    const timeTaken = Math.round((Date.now() - questionStart) / 1000);
    const newAnswers = [...answers, {
      question_id: q.id,
      selected_answer: selected,
      is_correct: selected === q.correct_answer,
      time_taken_seconds: timeTaken,
    }];
    setAnswers(newAnswers);

    if (current + 1 >= questions.length) {
      finishExam(newAnswers);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setConfirmed(false);
      setShowExplanation(false);
      setQuestionStart(Date.now());
    }
  }, [selected, confirmed, questions, current, answers, questionStart]);

  const finishExam = async (finalAnswers: ExamAnswer[]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const score = finalAnswers.filter((a) => a.is_correct).length;
    const weakMap: Record<string, number[]> = {};
    finalAnswers.forEach((a) => {
      const q = questions.find((q) => q.id === a.question_id);
      if (!q) return;
      if (!weakMap[q.topic]) weakMap[q.topic] = [0, 0];
      weakMap[q.topic][1]++;
      if (a.is_correct) weakMap[q.topic][0]++;
    });
    const weakTopics = Object.entries(weakMap)
      .filter(([, v]) => v[0] / v[1] < 0.7)
      .map(([k]) => k)
      .join(",");

    try {
      await invoke("save_exam_session", {
        mode, score, total: finalAnswers.length,
        duration: elapsed, answers: finalAnswers, weakTopics
      });
      await Promise.all([loadStats(), loadExamHistory()]);
    } catch (e) {
      console.error("Failed to save exam:", e);
    }
    setPhase("results");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const [showAI, setShowAI] = useState(false);

  if (phase === "config") return <ExamConfig
    mode={mode} setMode={setMode}
    questionCount={questionCount} setQuestionCount={setQuestionCount}
    topic={topic} setTopic={setTopic}
    source={source} setSource={setSource}
    difficulty={difficulty} setDifficulty={setDifficulty}
    onStart={startExam}
  />;

  if (phase === "results") return <ExamResults
    questions={questions} answers={answers} elapsed={elapsed} mode={mode}
    onRestart={() => setPhase("config")}
  />;

  const q = questions[current];
  const opts = [
    { key: "A", text: q.option_a },
    { key: "B", text: q.option_b },
    { key: "C", text: q.option_c },
    { key: "D", text: q.option_d },
  ] as const;

  const progress = (current / questions.length) * 100;

  const questionPanel = (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[#888] text-sm">Question {current + 1} of {questions.length}</span>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              q.difficulty <= 2 ? "bg-[#22c55e]/15 text-[#22c55e]" :
              q.difficulty === 3 ? "bg-[#f97316]/15 text-[#f97316]" :
              "bg-[#ef4444]/15 text-[#ef4444]"
            }`}>
              {["", "Easy", "Medium", "Hard", "Expert", "Expert+"][q.difficulty]}
            </span>
            <span className="text-[#444] text-xs">{q.source_document}</span>
            {q.clause && <span className="text-[#444] text-xs">§{q.clause}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Open-book PDF hint */}
          {mode === "open-book" && (
            <button
              onClick={() => {/* users switch to PDF view */ }}
              title="Open codebook in PDF viewer"
              className="flex items-center gap-1 text-[#555] hover:text-[#818cf8] text-xs transition-colors"
            >
              <FileText size={13} />
              Codebook
            </button>
          )}
          {/* AI toggle */}
          <button
            onClick={() => setShowAI((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showAI
              ? "bg-[#818cf8]/15 text-[#818cf8] border border-[#818cf8]/30"
              : "text-[#555] hover:text-[#818cf8] border border-transparent"
            }`}
          >
            <Bot size={13} />
            AI
          </button>
          <div className="flex items-center gap-1.5 text-[#f5c842]">
            <Timer size={14} />
            <span className="font-mono text-sm">{formatTime(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-[#1a1a1a] shrink-0">
        <div className="h-full bg-[#f5c842] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Body — question + optional AI panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="mb-2">
              <span className="text-[#555] text-xs font-medium uppercase tracking-wider">{q.topic}</span>
            </div>
            <p className="text-[#e5e5e5] text-base leading-relaxed mb-6">{q.question_text}</p>

            {/* Options */}
            <div className="space-y-3 mb-6">
              {opts.map(({ key, text }) => {
                let cls = "border border-[#2a2a2a] bg-[#111] text-[#ccc] hover:border-[#3a3a3a]";
                if (selected === key && !confirmed) cls = "border border-[#f5c842] bg-[#f5c842]/10 text-[#e5e5e5]";
                if (confirmed) {
                  if (key === q.correct_answer) cls = "border border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]";
                  else if (key === selected && key !== q.correct_answer) cls = "border border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]";
                  else cls = "border border-[#1f1f1f] bg-[#0f0f0f] text-[#444]";
                }
                return (
                  <button
                    key={key}
                    onClick={() => !confirmed && setSelected(key)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all ${cls}`}
                    disabled={confirmed}
                  >
                    <span className="font-bold text-sm w-5 shrink-0 mt-0.5">{key}.</span>
                    <span className="text-sm leading-relaxed">{text}</span>
                    {confirmed && key === q.correct_answer && <CheckCircle size={16} className="ml-auto shrink-0 mt-0.5 text-[#22c55e]" />}
                    {confirmed && key === selected && key !== q.correct_answer && <XCircle size={16} className="ml-auto shrink-0 mt-0.5 text-[#ef4444]" />}
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {showExplanation && (
              <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} className="text-[#f5c842]" />
                  <span className="text-[#f5c842] text-xs font-semibold">Explanation</span>
                </div>
                <p className="text-[#aaa] text-sm leading-relaxed">{q.explanation}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!confirmed ? (
                <button
                  onClick={confirmAnswer}
                  disabled={!selected}
                  className="flex-1 py-3 rounded-xl bg-[#f5c842] text-black font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#e5b832] transition-colors"
                >
                  Confirm Answer
                </button>
              ) : (
                <>
                  {!showExplanation && (
                    <button
                      onClick={() => setShowExplanation(true)}
                      className="px-4 py-3 rounded-xl border border-[#2a2a2a] text-[#888] text-sm hover:text-[#e5e5e5] hover:border-[#3a3a3a] transition-colors"
                    >
                      Explanation
                    </button>
                  )}
                  <button
                    onClick={() => setShowAI(true)}
                    className="px-4 py-3 rounded-xl border border-[#818cf8]/30 text-[#818cf8] text-sm hover:bg-[#818cf8]/10 transition-colors flex items-center gap-1.5"
                  >
                    <Bot size={14} />
                    Ask AI
                  </button>
                  <button
                    onClick={nextQuestion}
                    className="flex-1 py-3 rounded-xl bg-[#f5c842] text-black font-semibold text-sm hover:bg-[#e5b832] transition-colors flex items-center justify-center gap-2"
                  >
                    {current + 1 >= questions.length ? "Finish Exam" : "Next Question"}
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* AI Panel */}
        {showAI && (
          <div className="w-80 shrink-0 border-l border-[#2a2a2a]">
            <AIPanel
              question={confirmed ? q : undefined}
              embedded
              onClose={() => setShowAI(false)}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (mode === "open-book") {
    return (
      <DualPanelExam
        questionPanel={questionPanel}
        onClose={() => setMode("practice")}
      />
    );
  }

  return questionPanel;
}

function ExamConfig({ mode, setMode, questionCount, setQuestionCount, topic, setTopic, source, setSource, difficulty, setDifficulty, onStart }: {
  mode: ExamMode; setMode: (m: ExamMode) => void;
  questionCount: number; setQuestionCount: (n: number) => void;
  topic: string; setTopic: (t: string) => void;
  source: string; setSource: (s: string) => void;
  difficulty: number; setDifficulty: (d: number) => void;
  onStart: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#e5e5e5]">Start Exam Session</h1>
          <p className="text-[#666] text-sm mt-1">Configure your practice session</p>
        </div>

        {/* Mode */}
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider mb-2 block">Exam Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "timed", label: "Timed", desc: "1 min per question" },
              { v: "practice", label: "Practice", desc: "Instant explanations" },
              { v: "open-book", label: "Open Book", desc: "Use PDF codebook" },
              { v: "adaptive", label: "Adaptive", desc: "Adjusts difficulty" },
            ] as { v: ExamMode; label: string; desc: string }[]).map(({ v, label, desc }) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`p-3 rounded-lg border text-left transition-all ${mode === v
                  ? "border-[#f5c842] bg-[#f5c842]/10"
                  : "border-[#2a2a2a] bg-[#111] hover:border-[#3a3a3a]"
                }`}
              >
                <p className={`text-sm font-medium ${mode === v ? "text-[#f5c842]" : "text-[#e5e5e5]"}`}>{label}</p>
                <p className="text-xs text-[#666] mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Question count */}
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider mb-2 block">Number of Questions</label>
          <div className="flex gap-2">
            {[10, 20, 40, 70].map((n) => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${questionCount === n
                  ? "border-[#f5c842] bg-[#f5c842]/10 text-[#f5c842]"
                  : "border-[#2a2a2a] bg-[#111] text-[#888] hover:border-[#3a3a3a]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Source */}
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider mb-2 block">Source Document</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Topic */}
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider mb-2 block">Topic Filter</label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
          >
            {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Difficulty */}
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider mb-2 block">Difficulty</label>
          <div className="flex gap-2">
            {[["All", 0], ["Easy", 1], ["Medium", 2], ["Hard", 3], ["Expert", 4]].map(([label, val]) => (
              <button
                key={label}
                onClick={() => setDifficulty(val as number)}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${difficulty === val
                  ? "border-[#f5c842] bg-[#f5c842]/10 text-[#f5c842]"
                  : "border-[#2a2a2a] bg-[#111] text-[#888] hover:border-[#3a3a3a]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onStart}
          className="w-full py-3.5 rounded-xl bg-[#f5c842] text-black font-bold text-sm hover:bg-[#e5b832] transition-colors flex items-center justify-center gap-2"
        >
          <ChevronRight size={18} />
          Start Exam
        </button>
      </div>
    </div>
  );
}

function ExamResults({ questions, answers, elapsed, mode, onRestart }: {
  questions: Question[]; answers: ExamAnswer[]; elapsed: number; mode: string;
  onRestart: () => void;
}) {
  const score = answers.filter((a) => a.is_correct).length;
  const pct = Math.round((score / answers.length) * 100);
  const pass = pct >= 70;

  const wrongAnswers = answers
    .filter((a) => !a.is_correct)
    .map((a) => ({ answer: a, question: questions.find((q) => q.id === a.question_id)! }))
    .filter((x) => x.question);

  const formatTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Result header */}
        <div className={`rounded-xl p-6 border ${pass ? "border-[#22c55e]/30 bg-[#22c55e]/5" : "border-[#ef4444]/30 bg-[#ef4444]/5"}`}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${pass ? "bg-[#22c55e]/20" : "bg-[#ef4444]/20"}`}>
              {pass ? <Trophy size={24} className="text-[#22c55e]" /> : <XCircle size={24} className="text-[#ef4444]" />}
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: pass ? "#22c55e" : "#ef4444" }}>{pct}%</p>
              <p className="text-[#888] text-sm">{score} / {answers.length} correct — {pass ? "PASS" : "FAIL"} (70% required)</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#ffffff10]">
            <div>
              <p className="text-[#555] text-xs">Time</p>
              <p className="text-[#e5e5e5] font-medium text-sm">{formatTime(elapsed)}</p>
            </div>
            <div>
              <p className="text-[#555] text-xs">Mode</p>
              <p className="text-[#e5e5e5] font-medium text-sm capitalize">{mode}</p>
            </div>
            <div>
              <p className="text-[#555] text-xs">Wrong</p>
              <p className="text-[#ef4444] font-medium text-sm">{answers.length - score} questions</p>
            </div>
          </div>
        </div>

        {/* Wrong answers review */}
        {wrongAnswers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[#e5e5e5] mb-3">Review Incorrect Answers</h3>
            <div className="space-y-3">
              {wrongAnswers.map(({ answer, question }) => (
                <div key={question.id} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
                  <p className="text-sm text-[#e5e5e5] mb-3">{question.question_text}</p>
                  <div className="flex gap-3 mb-3 text-xs">
                    <span className="flex items-center gap-1 text-[#ef4444]">
                      <XCircle size={12} /> Your answer: {answer.selected_answer}
                    </span>
                    <span className="flex items-center gap-1 text-[#22c55e]">
                      <CheckCircle size={12} /> Correct: {question.correct_answer}
                    </span>
                  </div>
                  <p className="text-xs text-[#888] leading-relaxed bg-[#0a0a0a] rounded-lg p-3">
                    {question.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onRestart}
          className="w-full py-3 rounded-xl border border-[#2a2a2a] text-[#e5e5e5] font-medium text-sm hover:border-[#f5c842] hover:text-[#f5c842] transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw size={15} />
          New Exam Session
        </button>
      </div>
    </div>
  );
}
