import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Edit3, Save, X, StickyNote, Search, Tag } from "lucide-react";

interface Note {
  id: number;
  topic: string | null;
  pdf_name: string | null;
  page: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

const TOPICS = [
  "Inspection Intervals", "Corrosion Rate Calculation", "Remaining Life Calculation",
  "CUI - Corrosion Under Insulation", "Dead Legs", "Damage Mechanisms - HIC",
  "PWHT Requirements", "Piping Circuit Classification", "Condition Monitoring Locations",
  "Injection Points", "NDE Methods - RT vs UT", "Hydrotest Pressure",
  "MAWP Calculation", "Wall Thickness Calculation", "General",
];

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftTopic, setDraftTopic] = useState("General");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const raw = await invoke<any[]>("get_notes");
      setNotes(raw.map(r => ({
        id: r.id,
        topic: r.topic,
        pdf_name: r.pdf_name,
        page: r.page,
        content: r.content,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!draftContent.trim()) return;
    try {
      await invoke("add_note", {
        topic: draftTopic || null,
        pdfName: null,
        page: null,
        content: draftContent.trim(),
      });
      setCreating(false);
      setDraftContent("");
      setDraftTopic("General");
      await load();
    } catch (e) { console.error(e); }
  };

  const update = async (id: number) => {
    if (!draftContent.trim()) return;
    try {
      await invoke("update_note", { id, content: draftContent.trim() });
      setEditingId(null);
      setDraftContent("");
      await load();
    } catch (e) { console.error(e); }
  };

  const remove = async (id: number) => {
    try {
      await invoke("delete_note", { id });
      await load();
    } catch (e) { console.error(e); }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setDraftContent(note.content);
    setCreating(false);
  };

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setDraftContent("");
    setDraftTopic("General");
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditingId(null);
    setDraftContent("");
  };

  const filtered = filter
    ? notes.filter(n =>
        n.content.toLowerCase().includes(filter.toLowerCase()) ||
        (n.topic ?? "").toLowerCase().includes(filter.toLowerCase())
      )
    : notes;

  const grouped = TOPICS.reduce<Record<string, Note[]>>((acc, topic) => {
    const group = filtered.filter(n => n.topic === topic);
    if (group.length > 0) acc[topic] = group;
    return acc;
  }, {});
  const ungrouped = filtered.filter(n => !n.topic || !TOPICS.includes(n.topic));
  if (ungrouped.length > 0) grouped["Unsorted"] = ungrouped;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return iso; }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-3">
          <StickyNote size={16} className="text-[#f5c842]" />
          <h2 className="text-[#e5e5e5] font-semibold">Study Notes</h2>
          <span className="text-[#555] text-xs">{notes.length} notes</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5">
            <Search size={12} className="text-[#555]" />
            <input
              type="text"
              placeholder="Search notes..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-transparent text-xs text-[#e5e5e5] placeholder-[#444] focus:outline-none w-32"
            />
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f5c842]/10 border border-[#f5c842]/30 text-[#f5c842] text-sm hover:bg-[#f5c842]/20 transition-colors"
          >
            <Plus size={14} />
            New Note
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Create form */}
        {creating && (
          <div className="bg-[#111] border border-[#f5c842]/30 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <select
                value={draftTopic}
                onChange={e => setDraftTopic(e.target.value)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
              >
                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={cancelEdit} className="p-1.5 text-[#555] hover:text-[#888]"><X size={14} /></button>
                <button
                  onClick={save}
                  disabled={!draftContent.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f5c842] text-black text-xs font-semibold disabled:opacity-40"
                >
                  <Save size={12} />Save
                </button>
              </div>
            </div>
            <textarea
              autoFocus
              value={draftContent}
              onChange={e => setDraftContent(e.target.value)}
              placeholder="Write your note here... Use Markdown for formatting."
              rows={6}
              className="w-full bg-transparent text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none resize-none"
              onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && notes.length === 0 && !creating && (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <StickyNote size={40} className="text-[#2a2a2a] mb-4" />
            <p className="text-[#555] font-medium">No notes yet</p>
            <p className="text-[#333] text-sm mt-1">Create notes to save key concepts, formulas, and code references</p>
            <button
              onClick={startCreate}
              className="mt-4 px-4 py-2 rounded-xl bg-[#f5c842] text-black font-semibold text-sm hover:bg-[#e5b832]"
            >
              Create First Note
            </button>
          </div>
        )}

        {/* Grouped notes */}
        {Object.entries(grouped).map(([group, groupNotes]) => (
          <div key={group} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={11} className="text-[#555]" />
              <h3 className="text-[#555] text-xs font-semibold uppercase tracking-wider">{group}</h3>
              <span className="text-[#333] text-[10px]">{groupNotes.length}</span>
            </div>
            <div className="space-y-2">
              {groupNotes.map(note => (
                <div key={note.id} className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 group hover:border-[#3a3a3a] transition-colors">
                  {editingId === note.id ? (
                    <div>
                      <textarea
                        autoFocus
                        value={draftContent}
                        onChange={e => setDraftContent(e.target.value)}
                        rows={6}
                        className="w-full bg-transparent text-sm text-[#e5e5e5] focus:outline-none resize-none mb-3"
                      />
                      <div className="flex gap-2">
                        <button onClick={cancelEdit} className="px-3 py-1.5 text-[#555] text-xs hover:text-[#888]">Cancel</button>
                        <button
                          onClick={() => update(note.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f5c842] text-black text-xs font-semibold"
                        >
                          <Save size={11} />Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[#ccc] text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        <p className="text-[#333] text-[10px] mt-2">{formatDate(note.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(note)}
                          className="p-1.5 rounded-lg text-[#555] hover:text-[#e5e5e5] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => remove(note.id)}
                          className="p-1.5 rounded-lg text-[#555] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
