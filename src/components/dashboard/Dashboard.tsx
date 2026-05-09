import { useAppStore } from "../../store/appStore";
import { Zap, FileText, Layers, TrendingUp, TrendingDown, Award, Target, BookOpen, Calculator, Wrench, BarChart3, StickyNote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function Dashboard() {
  const { stats, setView, examHistory } = useAppStore();

  const recentExams = examHistory.slice(0, 6).reverse();

  const chartData = recentExams.map((e, i) => ({
    name: `Exam ${i + 1}`,
    score: e.percentage,
    fill: e.percentage >= 70 ? "#22c55e" : "#ef4444",
  }));

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#e5e5e5]">Training Dashboard</h1>
          <p className="text-[#666] text-sm mt-1">API 570 Piping Inspector Certification — Study System</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Questions Answered", value: stats?.total_questions_answered ?? 0,
              icon: Target, color: "#f5c842"
            },
            {
              label: "Exams Completed", value: stats?.total_exams ?? 0,
              icon: Award, color: "#818cf8"
            },
            {
              label: "Avg Score",
              value: stats ? `${stats.avg_score.toFixed(1)}%` : "—",
              icon: TrendingUp,
              color: (stats?.avg_score ?? 0) >= 70 ? "#22c55e" : "#ef4444"
            },
            {
              label: "Correct Answers", value: stats?.total_correct ?? 0,
              icon: BookOpen, color: "#22c55e"
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#555] text-xs">{label}</span>
                <Icon size={14} style={{ color }} />
              </div>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setView("exam")}
            className="bg-[#f5c842]/10 border border-[#f5c842]/30 rounded-xl p-4 text-left hover:bg-[#f5c842]/15 transition-colors"
          >
            <Zap size={20} className="text-[#f5c842] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Start Exam</p>
            <p className="text-[#888] text-xs mt-0.5">Timed · Practice · Adaptive</p>
          </button>
          <button
            onClick={() => setView("calculator")}
            className="bg-[#818cf8]/8 border border-[#818cf8]/25 rounded-xl p-4 text-left hover:bg-[#818cf8]/15 transition-colors"
          >
            <Calculator size={20} className="text-[#818cf8] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Calculations</p>
            <p className="text-[#888] text-xs mt-0.5">MAWP · CR · RL · Hydrotest</p>
          </button>
          <button
            onClick={() => setView("simulator")}
            className="bg-[#f97316]/8 border border-[#f97316]/25 rounded-xl p-4 text-left hover:bg-[#f97316]/15 transition-colors"
          >
            <Wrench size={20} className="text-[#f97316] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Simulator</p>
            <p className="text-[#888] text-xs mt-0.5">Field inspection scenarios</p>
          </button>
          <button
            onClick={() => setView("pdf")}
            className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-left hover:border-[#3a3a3a] transition-colors"
          >
            <FileText size={20} className="text-[#22d3ee] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Codebook PDF</p>
            <p className="text-[#888] text-xs mt-0.5">Import · Bookmark · Search</p>
          </button>
          <button
            onClick={() => setView("flashcards")}
            className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-left hover:border-[#3a3a3a] transition-colors"
          >
            <Layers size={20} className="text-[#22c55e] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Flashcards</p>
            <p className="text-[#888] text-xs mt-0.5">Spaced repetition (SM-2)</p>
          </button>
          <button
            onClick={() => setView("analytics")}
            className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-left hover:border-[#3a3a3a] transition-colors"
          >
            <BarChart3 size={20} className="text-[#818cf8] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Analytics</p>
            <p className="text-[#888] text-xs mt-0.5">Heat map · Streak · Progress</p>
          </button>
          <button
            onClick={() => setView("notes")}
            className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-left hover:border-[#3a3a3a] transition-colors"
          >
            <StickyNote size={20} className="text-[#f5c842] mb-2" />
            <p className="text-[#e5e5e5] font-semibold text-sm">Notes</p>
            <p className="text-[#888] text-xs mt-0.5">Study notes by topic</p>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Score History Chart */}
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
            <h2 className="text-sm font-semibold text-[#e5e5e5] mb-4">Recent Exam Scores</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${v}%`, "Score"]}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-[#444] text-sm">
                No exams yet — take your first exam!
              </div>
            )}
          </div>

          {/* Weak Topics */}
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown size={14} className="text-[#ef4444]" />
              <h2 className="text-sm font-semibold text-[#e5e5e5]">Weak Topics</h2>
            </div>
            {(stats?.weak_topics?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {stats!.weak_topics.map((t) => (
                  <div key={t.topic}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#aaa] truncate mr-2">{t.topic}</span>
                      <span className="text-[#ef4444] shrink-0">{(t.accuracy * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-[#1f1f1f] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#ef4444] rounded-full transition-all"
                        style={{ width: `${t.accuracy * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-[#444] text-sm">
                Answer questions to see weak topics
              </div>
            )}
          </div>
        </div>

        {/* Learning Path */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#e5e5e5] mb-4">API 570 Learning Path</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { phase: "Phase 1", label: "Foundation", docs: ["API 570", "API 574"], color: "#f5c842", done: false },
              { phase: "Phase 2", label: "Engineering", docs: ["ASME B31.3", "API 577"], color: "#818cf8", done: false },
              { phase: "Phase 3", label: "Advanced", docs: ["API 571", "ASME Sec V", "ASME Sec IX"], color: "#22c55e", done: false },
              { phase: "Phase 4", label: "Supplementary", docs: ["B16.5", "PCC-2", "API 578"], color: "#f97316", done: false },
            ].map(({ phase, label, docs, color }) => (
              <div key={phase} className="border border-[#2a2a2a] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-[#666]">{phase}</span>
                </div>
                <p className="text-xs font-semibold text-[#e5e5e5] mb-2">{label}</p>
                <div className="space-y-1">
                  {docs.map((d) => (
                    <p key={d} className="text-[10px] text-[#555]">{d}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
