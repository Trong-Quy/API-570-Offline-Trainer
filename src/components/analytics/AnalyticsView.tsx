import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart3, Flame, Target, Calendar, BookOpen,
  TrendingUp, Award, Layers
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid,
  PolarAngleAxis, Radar
} from "recharts";

interface HeatmapCell {
  topic: string;
  difficulty: number;
  total: number;
  correct: number;
  accuracy: number; // -1 = not attempted
}

interface AnalyticsData {
  heatmap: HeatmapCell[];
  daily: { day: string; exams: number; correct: number; total: number }[];
  streak: number;
  bySource: { source: string; total: number; correct: number; accuracy: number }[];
  byDifficulty: { difficulty: number; total: number; correct: number; accuracy: number }[];
  totalQuestions: number;
  totalFlashcards: number;
  dueToday: number;
  totalNotes: number;
}

const DIFF_LABELS = ["", "Easy", "Medium", "Hard", "Expert"];
const ACCURACY_COLOR = (acc: number) => {
  if (acc < 0) return "#1a1a1a";
  if (acc < 40) return "#ef4444";
  if (acc < 60) return "#f97316";
  if (acc < 75) return "#f5c842";
  if (acc < 90) return "#84cc16";
  return "#22c55e";
};

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<AnalyticsData>("get_analytics")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-8 h-8 border-2 border-[#f5c842] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a] text-[#555]">
      Failed to load analytics.
    </div>
  );

  // Build topic × difficulty grid
  const topics = [...new Set(data.heatmap.map(c => c.topic))].sort();
  const diffs = [1, 2, 3, 4];

  const getCell = (topic: string, diff: number): HeatmapCell | undefined =>
    data.heatmap.find(c => c.topic === topic && c.difficulty === diff);

  // Radar data from byDifficulty
  const radarData = data.byDifficulty.map(d => ({
    subject: DIFF_LABELS[d.difficulty] ?? `D${d.difficulty}`,
    accuracy: d.accuracy,
    fullMark: 100,
  }));

  // Daily chart last 30 entries
  const dailyData = data.daily.slice(-30).map(d => ({
    day: d.day.slice(5), // MM-DD
    score: d.total > 0 ? Math.round(d.correct / d.total * 100) : 0,
    exams: d.exams,
  }));

  const noActivity = data.daily.length === 0;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e5e5e5]">Analytics</h1>
            <p className="text-[#666] text-sm mt-1">Performance breakdown by topic, difficulty, and time</p>
          </div>
          {/* Streak */}
          <div className="flex items-center gap-2 bg-[#f97316]/10 border border-[#f97316]/30 rounded-xl px-5 py-3">
            <Flame size={20} className="text-[#f97316]" />
            <div>
              <p className="text-[#f97316] font-bold text-2xl leading-none">{data.streak}</p>
              <p className="text-[#f97316]/70 text-xs mt-0.5">day streak</p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Question Bank", value: data.totalQuestions, icon: BookOpen, color: "#818cf8" },
            { label: "Flashcards", value: data.totalFlashcards, icon: Layers, color: "#22c55e" },
            { label: "Due Today", value: data.dueToday, icon: Calendar, color: data.dueToday > 0 ? "#f97316" : "#22c55e" },
            { label: "Notes", value: data.totalNotes, icon: Target, color: "#f5c842" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#555] text-xs">{label}</span>
                <Icon size={13} style={{ color }} />
              </div>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Score over time */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-[#818cf8]" />
            <h2 className="text-sm font-semibold text-[#e5e5e5]">Exam Score Trend (last 30 days)</h2>
          </div>
          {noActivity ? (
            <div className="h-32 flex items-center justify-center text-[#444] text-sm">
              No exam activity yet — take your first exam!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={dailyData}>
                <XAxis dataKey="day" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v}%`, "Score"]}
                />
                <Line type="monotone" dataKey="score" stroke="#f5c842" strokeWidth={2} dot={{ r: 2, fill: "#f5c842" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Two-column: Radar + Source breakdown */}
        <div className="grid grid-cols-2 gap-4">
          {/* Radar by difficulty */}
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Award size={14} className="text-[#f5c842]" />
              <h2 className="text-sm font-semibold text-[#e5e5e5]">Accuracy by Difficulty</h2>
            </div>
            {radarData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[#444] text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <RadarChart data={radarData} cx="50%" cy="50%">
                  <PolarGrid stroke="#2a2a2a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#888", fontSize: 11 }} />
                  <Radar dataKey="accuracy" stroke="#f5c842" fill="#f5c842" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By source document */}
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={14} className="text-[#818cf8]" />
              <h2 className="text-sm font-semibold text-[#e5e5e5]">By Source Document</h2>
            </div>
            {data.bySource.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[#444] text-sm">No data yet</div>
            ) : (
              <div className="space-y-3">
                {data.bySource.map(s => (
                  <div key={s.source}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#888]">{s.source}</span>
                      <span className="text-[#aaa]">{s.correct}/{s.total} ({s.accuracy}%)</span>
                    </div>
                    <div className="h-2 bg-[#1f1f1f] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${s.accuracy}%`, background: ACCURACY_COLOR(s.accuracy) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Topic × Difficulty Heatmap */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-[#22c55e]" />
            <h2 className="text-sm font-semibold text-[#e5e5e5]">Topic × Difficulty Heat Map</h2>
            <div className="ml-auto flex items-center gap-3 text-[10px] text-[#555]">
              {[
                { color: "#1a1a1a", label: "Not tried" },
                { color: "#ef4444", label: "<40%" },
                { color: "#f97316", label: "40-59%" },
                { color: "#f5c842", label: "60-74%" },
                { color: "#84cc16", label: "75-89%" },
                { color: "#22c55e", label: "≥90%" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {topics.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-[#444] text-sm">
              Answer questions to populate the heat map
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[#555] font-normal pb-2 pr-4 min-w-[200px]">Topic</th>
                    {diffs.map(d => (
                      <th key={d} className="text-center text-[#555] font-normal pb-2 w-20 px-1">{DIFF_LABELS[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topics.map(topic => (
                    <tr key={topic}>
                      <td className="text-[#888] py-1 pr-4 truncate max-w-[200px]" title={topic}>
                        {topic}
                      </td>
                      {diffs.map(diff => {
                        const cell = getCell(topic, diff);
                        const acc = cell?.accuracy ?? -1;
                        return (
                          <td key={diff} className="px-1 py-1 text-center">
                            <div
                              className="w-16 h-7 rounded mx-auto flex items-center justify-center text-[10px] font-medium cursor-default transition-all hover:opacity-80"
                              style={{
                                background: ACCURACY_COLOR(acc),
                                color: acc < 0 ? "#2a2a2a" : acc < 60 ? "#fff" : "#000",
                              }}
                              title={acc < 0 ? "Not attempted" : `${acc}% (${cell?.correct}/${cell?.total})`}
                            >
                              {acc >= 0 ? `${acc}%` : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Study calendar — last 60 days */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={14} className="text-[#818cf8]" />
            <h2 className="text-sm font-semibold text-[#e5e5e5]">Study Activity (last 60 days)</h2>
          </div>
          {data.daily.length === 0 ? (
            <div className="h-16 flex items-center justify-center text-[#444] text-sm">
              No activity recorded yet
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 60 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (59 - i));
                const key = date.toISOString().slice(0, 10);
                const dayData = data.daily.find(d => d.day === key);
                const hasActivity = !!dayData;
                const score = dayData && dayData.total > 0
                  ? Math.round(dayData.correct / dayData.total * 100)
                  : 0;
                return (
                  <div
                    key={key}
                    title={hasActivity ? `${key}: ${score}% (${dayData?.exams} exam${dayData?.exams !== 1 ? "s" : ""})` : key}
                    className="w-4 h-4 rounded-sm transition-all hover:opacity-80 cursor-default"
                    style={{ background: hasActivity ? ACCURACY_COLOR(score) : "#1a1a1a" }}
                  />
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
