import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Save, RefreshCw, AlertCircle, CheckCircle, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useAppStore } from "../../store/appStore";

interface GeneratedQuestion {
  source_document: string;
  clause: string;
  topic: string;
  difficulty: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  tags: string;
}

const TOPICS_FOR_GENERATION = [
  "Inspection Intervals", "Corrosion Rate Calculation", "Remaining Life Calculation",
  "CUI - Corrosion Under Insulation", "Dead Legs", "Damage Mechanisms - HIC",
  "PWHT Requirements", "Piping Circuit Classification", "Condition Monitoring Locations",
  "Injection Points", "NDE Methods - RT vs UT", "Hydrotest Pressure",
  "MAWP Calculation", "Wall Thickness Calculation", "Fitness for Service",
  "API 571 Damage Mechanisms", "ASME B31.3 Calculations", "RBI Prioritization",
];

const SOURCES = ["API 570", "API 571", "ASME B31.3", "API 574", "API 577", "API 578", "API 580/581", "ASME B16.5"];

const SYSTEM_PROMPT = `You are an API 570 Piping Inspector certification exam question writer. Generate exam questions in the exact JSON format below, following these rules:
- Questions must test API 570, API 571, ASME B31.3, or related code knowledge
- Use realistic numbers and scenarios a piping inspector would encounter
- Distractors (wrong answers) must be plausible but clearly wrong on code examination
- Explanation must cite the specific code clause
- difficulty: 1=easy, 2=medium, 3=hard, 4=expert
- correct_answer must be exactly "A", "B", "C", or "D"
- For calculation questions: use a single consistent unit system throughout; mpy = mils per year (NOT mm/year); verify units cancel before computing; show the formula with units in the explanation

Return ONLY a JSON object with this exact structure, no other text:
{
  "source_document": "API 570",
  "clause": "6.1",
  "topic": "Inspection Intervals",
  "difficulty": 2,
  "question_text": "...",
  "option_a": "...",
  "option_b": "...",
  "option_c": "...",
  "option_d": "...",
  "correct_answer": "B",
  "explanation": "...",
  "tags": "tag1,tag2,tag3"
}`;

function buildGenerationPrompt(topic: string, source: string, difficulty: number, style: string): string {
  const diffLabel = ["", "easy conceptual", "medium application", "hard calculation/scenario", "expert multi-step"][difficulty] ?? "medium";
  const styleDesc = style === "calculation" ? "a calculation-based problem with realistic numbers"
    : style === "scenario" ? "a realistic field inspection scenario requiring code-based decision making"
    : "a standard multiple-choice question testing code knowledge";

  return `${SYSTEM_PROMPT}

Generate ${styleDesc} about "${topic}" from ${source}.
Difficulty level: ${diffLabel}.
The question should test whether a candidate has studied the relevant API/ASME code sections.
Make sure the explanation clearly states WHY the correct answer is right and references the specific clause.`;
}

export function AIQuestionGenerator() {
  const { settings, aiStatus } = useAppStore();

  const [topic, setTopic] = useState(TOPICS_FOR_GENERATION[0]);
  const [source, setSource] = useState("API 570");
  const [difficulty, setDifficulty] = useState(2);
  const [style, setStyle] = useState<"standard" | "calculation" | "scenario">("standard");

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedQuestion | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [parseError, setParseError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Load count of AI-generated questions already saved
  useEffect(() => {
    invoke<number>("get_ai_question_count").then(setSavedCount).catch(() => {});
  }, []);

  const generate = async () => {
    if (aiStatus !== "online") return;
    setGenerating(true);
    setGenerated(null);
    setParseError("");
    setRawResponse("");
    setSaved(false);

    const prompt = buildGenerationPrompt(topic, source, difficulty, style);

    try {
      const res = await fetch(`${settings.aiEndpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.aiModel, prompt, stream: false }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      const text: string = data.response ?? "";
      setRawResponse(text);

      // Extract JSON from response — handle markdown code fences
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

      const parsed: GeneratedQuestion = JSON.parse(jsonStr);

      // Validate required fields
      const required = ["question_text", "option_a", "option_b", "option_c", "option_d", "correct_answer", "explanation"];
      const missing = required.filter(k => !parsed[k as keyof GeneratedQuestion]);
      if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(", ")}`);
      if (!["A", "B", "C", "D"].includes(parsed.correct_answer)) throw new Error("correct_answer must be A, B, C, or D");

      // Fill optional fields with defaults
      parsed.source_document = parsed.source_document || source;
      parsed.clause = parsed.clause || "";
      parsed.topic = parsed.topic || topic;
      parsed.difficulty = parsed.difficulty ?? difficulty;
      parsed.tags = parsed.tags || topic.toLowerCase();

      setGenerated(parsed);
    } catch (e: any) {
      setParseError(e.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  };

  const saveQuestion = async () => {
    if (!generated) return;
    try {
      await invoke("insert_generated_question", {
        sourceDocument: generated.source_document,
        clause: generated.clause || null,
        topic: generated.topic,
        difficulty: generated.difficulty,
        questionText: generated.question_text,
        optionA: generated.option_a,
        optionB: generated.option_b,
        optionC: generated.option_c,
        optionD: generated.option_d,
        correctAnswer: generated.correct_answer,
        explanation: generated.explanation,
        tags: generated.tags || null,
      });
      setSaved(true);
      setSavedCount(c => c + 1);
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  const DIFF_LABELS = ["", "Easy", "Medium", "Hard", "Expert"];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e5e5e5]">AI Question Generator</h1>
            <p className="text-[#666] text-sm mt-1">Use your local AI to generate new API 570 exam questions</p>
          </div>
          <div className="text-right">
            <p className="text-[#f5c842] font-bold text-xl">{savedCount}</p>
            <p className="text-[#555] text-xs">AI questions saved</p>
          </div>
        </div>

        {/* AI offline warning */}
        {aiStatus !== "online" && (
          <div className="bg-[#f97316]/10 border border-[#f97316]/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-[#f97316] shrink-0 mt-0.5" />
            <div>
              <p className="text-[#f97316] text-sm font-medium">AI is offline</p>
              <p className="text-[#f97316]/70 text-xs mt-0.5">
                Start Ollama: <code className="bg-black/30 px-1 rounded">ollama serve</code> — then check Settings to verify connection.
              </p>
            </div>
          </div>
        )}

        {/* Generation config */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Bot size={14} className="text-[#818cf8]" />
            <span className="text-[#e5e5e5] text-sm font-semibold">Question Parameters</span>
            <span className="ml-auto text-xs text-[#555]">Model: {settings.aiModel}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Topic</label>
              <select value={topic} onChange={e => setTopic(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#818cf8]">
                {TOPICS_FOR_GENERATION.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Source Document</label>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#818cf8]">
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Difficulty</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${difficulty === d
                      ? "border-[#818cf8] bg-[#818cf8]/10 text-[#818cf8]"
                      : "border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a]"}`}>
                    {DIFF_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Question Style</label>
              <div className="flex gap-1.5">
                {(["standard", "calculation", "scenario"] as const).map(s => (
                  <button key={s} onClick={() => setStyle(s)}
                    className={`flex-1 py-2 rounded-lg border text-[10px] font-medium transition-all capitalize ${style === s
                      ? "border-[#818cf8] bg-[#818cf8]/10 text-[#818cf8]"
                      : "border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={generating || aiStatus !== "online"}
            className="w-full py-3 rounded-xl bg-[#818cf8] text-white font-bold text-sm hover:bg-[#6366f1] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {generating
              ? <><RefreshCw size={15} className="animate-spin" />Generating...</>
              : <><Sparkles size={15} />Generate Question</>}
          </button>
        </div>

        {/* Parse error */}
        {parseError && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-[#ef4444] shrink-0 mt-0.5" />
              <div>
                <p className="text-[#ef4444] text-sm font-medium">Parse Error</p>
                <p className="text-[#ef4444]/70 text-xs mt-1">{parseError}</p>
                <p className="text-[#555] text-xs mt-1">Try generating again — the model may produce valid JSON on retry.</p>
              </div>
            </div>
            {rawResponse && (
              <button onClick={() => setShowRaw(v => !v)} className="mt-2 text-xs text-[#555] flex items-center gap-1 hover:text-[#888]">
                {showRaw ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showRaw ? "Hide" : "Show"} raw response
              </button>
            )}
            {showRaw && rawResponse && (
              <pre className="mt-2 text-[10px] text-[#555] bg-[#111] rounded p-2 overflow-x-auto max-h-40">{rawResponse}</pre>
            )}
          </div>
        )}

        {/* Generated question preview */}
        {generated && (
          <div className="bg-[#111] border border-[#818cf8]/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#818cf8]" />
              <span className="text-[#818cf8] text-sm font-semibold">Generated Question</span>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs bg-[#1a1a1a] text-[#888] px-2 py-0.5 rounded">{generated.source_document}</span>
                {generated.clause && <span className="text-xs text-[#555]">§{generated.clause}</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  generated.difficulty <= 2 ? "bg-[#22c55e]/15 text-[#22c55e]" :
                  generated.difficulty === 3 ? "bg-[#f97316]/15 text-[#f97316]" :
                  "bg-[#ef4444]/15 text-[#ef4444]"
                }`}>{DIFF_LABELS[generated.difficulty]}</span>
              </div>
            </div>

            <div>
              <p className="text-[#555] text-xs mb-1">{generated.topic}</p>
              <p className="text-[#e5e5e5] text-sm leading-relaxed">{generated.question_text}</p>
            </div>

            <div className="space-y-2">
              {(["A", "B", "C", "D"] as const).map(key => {
                const text = generated[`option_${key.toLowerCase()}` as keyof GeneratedQuestion] as string;
                const isCorrect = key === generated.correct_answer;
                return (
                  <div key={key} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                    isCorrect
                      ? "border-[#22c55e]/40 bg-[#22c55e]/8 text-[#22c55e]"
                      : "border-[#1f1f1f] text-[#666]"
                  }`}>
                    <span className="font-bold w-4 shrink-0">{key}.</span>
                    <span>{text}</span>
                    {isCorrect && <span className="ml-auto text-[10px] font-bold shrink-0">CORRECT</span>}
                  </div>
                );
              })}
            </div>

            <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3">
              <p className="text-[#f5c842] text-xs font-semibold mb-1">Explanation</p>
              <p className="text-[#aaa] text-sm leading-relaxed">{generated.explanation}</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={generate}
                disabled={generating}
                className="px-4 py-2.5 rounded-xl border border-[#2a2a2a] text-[#888] text-sm hover:border-[#3a3a3a] hover:text-[#e5e5e5] flex items-center gap-1.5"
              >
                <RefreshCw size={13} />Regenerate
              </button>
              <button
                onClick={saveQuestion}
                disabled={saved}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  saved
                    ? "bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e]"
                    : "bg-[#818cf8] text-white hover:bg-[#6366f1]"
                }`}
              >
                {saved ? <><CheckCircle size={14} />Saved to Question Bank</> : <><Save size={14} />Save to Question Bank</>}
              </button>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-xs text-[#555] space-y-1">
          <p className="text-[#888] font-medium mb-2">How it works</p>
          <p>1. Select topic, difficulty, and style — the AI receives a structured prompt</p>
          <p>2. Your local {settings.aiModel} model generates a question in JSON format</p>
          <p>3. Review the question, then save it to your question bank</p>
          <p>4. Saved questions immediately appear in exam and search</p>
          <p className="text-[#444] mt-2">Quality varies by model — review before saving. Smaller models (3B) may need multiple tries.</p>
        </div>
      </div>
    </div>
  );
}
