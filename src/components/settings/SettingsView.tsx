import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Bot, Database, RefreshCw, CheckCircle, AlertCircle, Download } from "lucide-react";
import { useAppStore } from "../../store/appStore";

export function SettingsView() {
  const { settings, saveSettings, aiStatus, checkAiStatus } = useAppStore();

  const [endpoint, setEndpoint] = useState(settings.aiEndpoint);
  const [model, setModel] = useState(settings.aiModel);
  const [timerSec, setTimerSec] = useState(settings.examTimerSeconds);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"" | "ok" | "fail">("");
  const [reseedMsg, setReseedMsg] = useState("");

  const save = () => {
    setSaving(true);
    saveSettings({
      aiEndpoint: endpoint,
      aiModel: model,
      examTimerSeconds: timerSec,
      aiEnabled: true,
    });
    checkAiStatus();
    setTimeout(() => setSaving(false), 800);
  };

  const testAi = async () => {
    setTesting(true);
    setTestResult("");
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
      setTestResult(res.ok ? "ok" : "fail");
      checkAiStatus();
    } catch {
      setTestResult("fail");
      checkAiStatus();
    } finally {
      setTesting(false);
    }
  };

  const reseedDb = async () => {
    setReseedMsg("Reseeding...");
    try {
      await invoke("seed_questions");
      setReseedMsg("Already seeded — no duplicates added.");
    } catch (e) {
      setReseedMsg("Error: " + String(e));
    }
  };

  const SUGGESTED_MODELS = [
    { id: "qwen2.5:7b", label: "Qwen 2.5 7B (Recommended)", desc: "Good balance of speed and quality on M1" },
    { id: "mistral:7b", label: "Mistral 7B", desc: "Strong reasoning, widely supported" },
    { id: "phi3:mini", label: "Phi-3 Mini", desc: "Very fast, lower RAM usage" },
    { id: "llama3.2:3b", label: "Llama 3.2 3B", desc: "Fastest option, lower accuracy" },
    { id: "deepseek-r1:7b", label: "DeepSeek R1 7B", desc: "Excellent reasoning for technical content" },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e5e5e5]">Settings</h1>
          <p className="text-[#666] text-sm mt-1">Configure AI, exam preferences, and database options</p>
        </div>

        {/* AI Configuration */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-[#818cf8]" />
            <h2 className="text-[#e5e5e5] font-semibold">Local AI (Ollama)</h2>
            <div className={`ml-auto w-2 h-2 rounded-full ${aiStatus === "online" ? "bg-[#22c55e]" : aiStatus === "checking" ? "bg-[#f5c842] animate-pulse" : "bg-[#ef4444]"}`} />
            <span className="text-xs text-[#555] capitalize">{aiStatus}</span>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 text-sm text-[#888] space-y-2">
            <p className="text-[#aaa] font-medium">Setup Instructions</p>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              <li>Install Ollama from <span className="text-[#818cf8]">https://ollama.ai</span></li>
              <li>Open Terminal: <code className="bg-[#111] px-1 rounded text-[#f5c842]">ollama pull qwen2.5:7b</code></li>
              <li>Start service: <code className="bg-[#111] px-1 rounded text-[#f5c842]">ollama serve</code></li>
              <li>Click "Test Connection" below</li>
            </ol>
          </div>

          <div>
            <label className="text-xs text-[#666] mb-1.5 block">Ollama Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#818cf8]"
            />
          </div>

          <div>
            <label className="text-xs text-[#666] mb-1.5 block">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#818cf8]"
            >
              {SUGGESTED_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value={model}>{model} (current)</option>
            </select>
            <p className="text-xs text-[#444] mt-1">
              {SUGGESTED_MODELS.find((m) => m.id === model)?.desc ?? "Custom model ID"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={testAi}
              disabled={testing}
              className="flex-1 py-2 rounded-lg border border-[#2a2a2a] text-sm text-[#888] hover:text-[#e5e5e5] hover:border-[#3a3a3a] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {testing ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Test Connection
            </button>
            {testResult === "ok" && <div className="flex items-center gap-1.5 px-3 text-[#22c55e] text-sm"><CheckCircle size={13} />Connected</div>}
            {testResult === "fail" && <div className="flex items-center gap-1.5 px-3 text-[#ef4444] text-sm"><AlertCircle size={13} />Not reachable</div>}
          </div>
        </div>

        {/* Exam Settings */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-[#f5c842]" />
            <h2 className="text-[#e5e5e5] font-semibold">Exam Preferences</h2>
          </div>

          <div>
            <label className="text-xs text-[#666] mb-1.5 block">
              Timed Mode — Seconds per Question
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={300}
                step={15}
                value={timerSec}
                onChange={(e) => setTimerSec(Number(e.target.value))}
                className="flex-1 accent-[#f5c842]"
              />
              <span className="text-[#e5e5e5] text-sm w-16 text-right">{timerSec}s</span>
            </div>
            <p className="text-[#444] text-xs mt-1">
              API 570 exam: ~90 sec/question average. Actual exam: 4 hours / 150 questions.
            </p>
          </div>
        </div>

        {/* Database */}
        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[#22c55e]" />
            <h2 className="text-[#e5e5e5] font-semibold">Database</h2>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reseedDb}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#2a2a2a] text-[#888] text-sm hover:border-[#3a3a3a] hover:text-[#e5e5e5] transition-colors"
            >
              <Download size={13} />
              Re-seed Questions
            </button>
          </div>
          {reseedMsg && <p className="text-[#555] text-xs">{reseedMsg}</p>}
          <p className="text-xs text-[#444]">
            Database is stored locally in your app data directory. All progress, bookmarks, and exam history is private and offline.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#f5c842] text-black font-bold text-sm hover:bg-[#e5b832] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><RefreshCw size={14} className="animate-spin" />Saving...</> : "Save Settings"}
        </button>

        {/* About */}
        <div className="text-center text-[#333] text-xs space-y-1 pb-4">
          <p>API 570 Offline Training System v0.2.0</p>
          <p>100% local · No telemetry · No internet required</p>
          <p>Built with Tauri + Rust + React</p>
        </div>
      </div>
    </div>
  );
}
