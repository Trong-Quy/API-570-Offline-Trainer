import { useAppStore } from "../store/appStore";
import { History, CheckCircle, XCircle, Clock, Award } from "lucide-react";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export function HistoryView() {
  const { examHistory, stats } = useAppStore();

  const formatDuration = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const chartData = [...examHistory].reverse().slice(-10).map((e, i) => ({
    name: `#${i + 1}`,
    score: e.percentage,
    mode: e.mode,
  }));

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <div className="flex items-center gap-3">
          <History size={18} className="text-[#818cf8]" />
          <h2 className="text-xl font-bold text-[#e5e5e5]">Exam History</h2>
        </div>

        {/* Summary stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Exams", value: stats.total_exams, icon: Award, color: "#818cf8" },
              { label: "Avg Score", value: `${stats.avg_score.toFixed(1)}%`, icon: CheckCircle, color: "#22c55e" },
              { label: "Questions Done", value: stats.total_questions_answered, icon: CheckCircle, color: "#f5c842" },
              { label: "Correct", value: stats.total_correct, icon: CheckCircle, color: "#22c55e" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#555] text-xs">{label}</span>
                  <Icon size={13} style={{ color }} />
                </div>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Score trend chart */}
        {chartData.length > 0 && (
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#e5e5e5] mb-4">Score Trend (last 10 exams)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v}%`, "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#f5c842"
                  strokeWidth={2}
                  dot={{ fill: "#f5c842", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* History list */}
        <div>
          <h3 className="text-sm font-semibold text-[#e5e5e5] mb-3">All Sessions</h3>
          {examHistory.length === 0 ? (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-8 text-center">
              <History size={32} className="text-[#333] mx-auto mb-3" />
              <p className="text-[#555] text-sm">No exams taken yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {examHistory.map((session) => {
                const pass = session.percentage >= 70;
                return (
                  <div key={session.id} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${pass ? "bg-[#22c55e]/15" : "bg-[#ef4444]/15"}`}>
                      {pass
                        ? <CheckCircle size={18} className="text-[#22c55e]" />
                        : <XCircle size={18} className="text-[#ef4444]" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-lg font-bold ${pass ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                          {session.percentage}%
                        </span>
                        <span className="text-[#888] text-sm">{session.score}/{session.totalQuestions} correct</span>
                        <span className="text-xs text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded capitalize">{session.mode}</span>
                      </div>
                      {session.weakTopics && (
                        <p className="text-[#444] text-xs truncate">Weak: {session.weakTopics}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-[#555] text-xs">
                        <Clock size={11} />
                        {formatDuration(session.durationSeconds)}
                      </div>
                      <p className="text-[#333] text-[10px] mt-0.5">{formatDate(session.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Weak vs Strong topics */}
        {stats && stats.weak_topics.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#ef4444] mb-3">Weakest Topics</h3>
              <div className="space-y-2">
                {stats.weak_topics.map((t) => (
                  <div key={t.topic}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#888] truncate mr-2">{t.topic}</span>
                      <span className="text-[#ef4444] shrink-0">{(t.accuracy * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-[#1f1f1f] rounded-full">
                      <div className="h-full bg-[#ef4444] rounded-full" style={{ width: `${t.accuracy * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#22c55e] mb-3">Strongest Topics</h3>
              <div className="space-y-2">
                {stats.strong_topics.map((t) => (
                  <div key={t.topic}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#888] truncate mr-2">{t.topic}</span>
                      <span className="text-[#22c55e] shrink-0">{(t.accuracy * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-[#1f1f1f] rounded-full">
                      <div className="h-full bg-[#22c55e] rounded-full" style={{ width: `${t.accuracy * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
