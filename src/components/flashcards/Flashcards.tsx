import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCcw, CheckCircle, Plus, Trash2, BookOpen } from "lucide-react";
import type { Flashcard } from "../../types";

type Tab = "review" | "browse" | "add";

const QUALITY_BUTTONS = [
  { q: 0, label: "Blackout", color: "#ef4444" },
  { q: 2, label: "Hard",    color: "#f97316" },
  { q: 3, label: "OK",      color: "#f5c842" },
  { q: 4, label: "Good",    color: "#22c55e" },
  { q: 5, label: "Easy",    color: "#06b6d4" },
];

export function Flashcards() {
  const [tab, setTab] = useState<Tab>("review");

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
        {([
          ["review", "Review Due"],
          ["browse", "Browse All"],
          ["add",    "Add Card"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
              tab === t
                ? "bg-[#f5c842]/10 text-[#f5c842] border border-[#f5c842]/30"
                : "text-[#666] hover:text-[#e5e5e5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "review" && <ReviewTab />}
      {tab === "browse" && <BrowseTab />}
      {tab === "add"    && <AddTab onAdded={() => setTab("browse")} />}
    </div>
  );
}

/* ── Review ──────────────────────────────────────────────────────────────── */
function ReviewTab() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState<"front" | "back">("front");
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCards(); }, []);

  const loadCards = async () => {
    setLoading(true);
    try {
      const due = await invoke<Flashcard[]>("get_flashcards_due");
      setCards(due);
      setIndex(0);
      setFlip("front");
      setReviewed(0);
      setDone(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const rate = async (quality: number) => {
    const card = cards[index];
    try { await invoke("review_flashcard", { id: card.id, quality }); } catch {}
    if (index + 1 >= cards.length) { setDone(true); }
    else { setIndex(i => i + 1); setFlip("front"); }
    setReviewed(r => r + 1);
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#f5c842] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (cards.length === 0 || done) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <CheckCircle size={48} className="text-[#22c55e] mb-4" />
      <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">
        {done ? `Session Complete! (${reviewed} cards)` : "All caught up!"}
      </h2>
      <p className="text-[#666] text-sm mb-6">
        {done ? "Great spaced repetition session." : "No cards due today — come back tomorrow!"}
      </p>
      <button onClick={loadCards} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f5c842] text-black font-semibold text-sm hover:bg-[#e5b832]">
        <RotateCcw size={15} />
        {done ? "Restart Session" : "Refresh"}
      </button>
    </div>
  );

  const card = cards[index];
  const progress = (index / cards.length) * 100;

  return (
    <div className="flex-1 flex flex-col">
      {/* Progress */}
      <div className="h-0.5 bg-[#1a1a1a] shrink-0">
        <div className="h-full bg-[#22c55e] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between px-6 py-2 text-xs text-[#555] shrink-0">
        <span>Card {index + 1} / {cards.length}</span>
        <span className="bg-[#1a1a1a] px-2 py-0.5 rounded">{card.topic}</span>
        <span>{reviewed} reviewed</span>
      </div>

      {/* Card flip area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl cursor-pointer" style={{ perspective: "1000px" }} onClick={() => setFlip(f => f === "front" ? "back" : "front")}>
          <div
            className="relative w-full transition-transform duration-500"
            style={{ transformStyle: "preserve-3d", transform: flip === "back" ? "rotateY(180deg)" : "rotateY(0deg)", minHeight: "260px" }}
          >
            {/* Front */}
            <div className="absolute inset-0 rounded-2xl bg-[#111] border border-[#2a2a2a] p-8 flex flex-col" style={{ backfaceVisibility: "hidden" }}>
              <p className="text-[#555] text-xs uppercase tracking-wider mb-4">Question</p>
              <p className="text-[#e5e5e5] text-xl font-medium flex-1 flex items-center">{card.front}</p>
              <p className="text-center text-[#444] text-xs mt-4">Click to reveal · {flip === "front" ? "↓" : "↑"}</p>
            </div>
            {/* Back */}
            <div className="absolute inset-0 rounded-2xl bg-[#0f1a0f] border border-[#22c55e]/30 p-8 flex flex-col" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              <p className="text-[#22c55e] text-xs uppercase tracking-wider mb-4">Answer</p>
              <pre className="text-[#e5e5e5] text-base leading-relaxed flex-1 whitespace-pre-wrap font-sans">{card.back}</pre>
            </div>
          </div>
        </div>

        {flip === "back" && (
          <div className="mt-8 w-full max-w-2xl">
            <p className="text-center text-[#555] text-xs mb-3">How well did you know this?</p>
            <div className="flex gap-2">
              {QUALITY_BUTTONS.map(({ q, label, color }) => (
                <button key={q} onClick={() => rate(q)} className="flex-1 py-3 rounded-xl border text-sm font-semibold transition-all hover:opacity-90"
                  style={{ borderColor: color + "40", color, background: color + "10" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {flip === "front" && <p className="mt-8 text-[#444] text-sm">Click the card to flip it, then rate your recall</p>}
      </div>
    </div>
  );
}

/* ── Browse All ──────────────────────────────────────────────────────────── */
function BrowseTab() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const all = await invoke<Flashcard[]>("get_all_flashcards", { topic: null });
      setCards(all);
      setTopics([...new Set(all.map(c => c.topic))].sort());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const remove = async (id: number) => {
    try { await invoke("delete_flashcard", { id }); loadAll(); } catch (e) { console.error(e); }
  };

  const filtered = topic ? cards.filter(c => c.topic === topic) : cards;

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#f5c842] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Topic filter */}
      <div className="w-48 shrink-0 border-r border-[#2a2a2a] overflow-y-auto py-3">
        <button
          onClick={() => setTopic("")}
          className={`w-full text-left px-4 py-2 text-sm transition-colors ${!topic ? "text-[#f5c842] bg-[#f5c842]/8" : "text-[#666] hover:text-[#e5e5e5]"}`}
        >
          All ({cards.length})
        </button>
        {topics.map(t => {
          const count = cards.filter(c => c.topic === t).length;
          return (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`w-full text-left px-4 py-2 text-xs transition-colors truncate ${topic === t ? "text-[#f5c842] bg-[#f5c842]/8" : "text-[#666] hover:text-[#e5e5e5]"}`}
              title={t}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-40 text-[#444] text-sm">No cards in this topic</div>
        )}
        {filtered.map(card => (
          <div key={card.id} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 group hover:border-[#3a3a3a] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[#e5e5e5] text-sm font-medium mb-1">{card.front}</p>
                <p className="text-[#888] text-xs leading-relaxed whitespace-pre-line line-clamp-2">{card.back}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-[#444]">
                  <span className="bg-[#1a1a1a] px-1.5 py-0.5 rounded">{card.topic}</span>
                  <span>Interval: {card.interval}d</span>
                  <span>Next: {card.next_review}</span>
                </div>
              </div>
              <button
                onClick={() => remove(card.id)}
                className="p-1.5 text-[#444] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Add Card ─────────────────────────────────────────────────────────────── */
function AddTab({ onAdded }: { onAdded: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topic, setTopic] = useState("General");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const TOPICS = [
    "General", "Corrosion Rate", "Remaining Life", "MAWP", "Hydrotest Pressure",
    "Inspection Intervals", "CUI - Corrosion Under Insulation", "Dead Legs",
    "Damage Mechanisms - HIC", "PWHT Requirements", "Piping Circuit Classification",
    "Condition Monitoring Locations", "Injection Points", "NDE Methods",
    "API 570 Definitions", "ASME B31.3", "API 571", "API 574", "API 577",
    "API 578 PMI", "API 580/581 RBI", "ASME B16.5 Flanges",
  ];

  const save = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    try {
      await invoke("add_flashcard", { topic, front: front.trim(), back: back.trim() });
      setSaved(true);
      setFront("");
      setBack("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <div>
          <h2 className="text-[#e5e5e5] font-semibold mb-1">Create Flashcard</h2>
          <p className="text-[#555] text-sm">Add your own cards to the spaced repetition deck</p>
        </div>

        <div>
          <label className="text-xs text-[#666] mb-1.5 block">Topic</label>
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
          >
            {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-[#666] mb-1.5 block">Front (Question / Prompt)</label>
          <textarea
            value={front}
            onChange={e => setFront(e.target.value)}
            placeholder="e.g., What is the remaining life formula?"
            rows={3}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none focus:border-[#f5c842] resize-none"
          />
        </div>

        <div>
          <label className="text-xs text-[#666] mb-1.5 block">Back (Answer)</label>
          <textarea
            value={back}
            onChange={e => setBack(e.target.value)}
            placeholder="e.g., RL = (t_curr - t_min) / CR&#10;Units: years"
            rows={5}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none focus:border-[#f5c842] resize-none font-mono"
          />
          <p className="text-[#444] text-xs mt-1">Use newlines for multi-line answers. Monospace font for formulas.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving || !front.trim() || !back.trim()}
            className="flex-1 py-3 rounded-xl bg-[#f5c842] text-black font-bold text-sm hover:bg-[#e5b832] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            {saved ? "Saved!" : saving ? "Saving..." : "Add Card"}
          </button>
          <button
            onClick={onAdded}
            className="px-4 py-3 rounded-xl border border-[#2a2a2a] text-[#888] text-sm hover:border-[#3a3a3a] hover:text-[#e5e5e5] flex items-center gap-1.5"
          >
            <BookOpen size={14} />
            Browse
          </button>
        </div>

        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#555] text-xs font-semibold mb-2">Example cards</p>
          <div className="space-y-2 text-xs text-[#444]">
            <p>Front: <span className="text-[#888]">CUI most susceptible temperature range for carbon steel?</span></p>
            <p>Back: <span className="text-[#888]">10°F to 350°F (-12°C to 175°C)</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
