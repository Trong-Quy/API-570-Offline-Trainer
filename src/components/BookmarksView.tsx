import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, Trash2, FileText, ChevronRight } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function BookmarksView() {
  const { bookmarks, loadBookmarks, pdfs, setActivePdf, setView } = useAppStore();
  const [deleting, setDeleting] = useState<number | null>(null);

  const deleteBookmark = async (id: number) => {
    setDeleting(id);
    try {
      await invoke("delete_bookmark", { id });
      await loadBookmarks();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  const openInPdf = (bookmark: typeof bookmarks[0]) => {
    const pdf = pdfs.find((p) => p.path === bookmark.pdf_path);
    if (pdf) {
      setActivePdf({ ...pdf, lastPage: bookmark.page });
      setView("pdf");
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <Bookmark size={16} className="text-[#f5c842]" />
        <h2 className="text-[#e5e5e5] font-semibold">Bookmarks</h2>
        <span className="text-[#555] text-xs">{bookmarks.length} saved</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {bookmarks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Bookmark size={40} className="text-[#2a2a2a] mb-4" />
            <p className="text-[#555] font-medium">No bookmarks yet</p>
            <p className="text-[#333] text-sm mt-1">Open a PDF and click Bookmark to save a page</p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-2">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 flex items-start gap-4 group hover:border-[#3a3a3a] transition-colors"
              >
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: bm.color || "#f5c842" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText size={13} className="text-[#818cf8] shrink-0" />
                    <span className="text-[#aaa] text-sm font-medium truncate">{bm.pdf_name}</span>
                    <span className="text-[#555] text-xs shrink-0">Page {bm.page}</span>
                  </div>
                  {bm.note && (
                    <p className="text-[#888] text-xs mt-1">{bm.note}</p>
                  )}
                  {bm.highlight_text && (
                    <p className="text-[#666] text-xs mt-1 italic line-clamp-2">"{bm.highlight_text}"</p>
                  )}
                  <p className="text-[#333] text-[10px] mt-2">{formatDate(bm.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openInPdf(bm)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[#888] hover:text-[#f5c842] text-xs transition-colors"
                    title="Open in PDF viewer"
                  >
                    <ChevronRight size={12} />
                    Open
                  </button>
                  <button
                    onClick={() => deleteBookmark(bm.id)}
                    disabled={deleting === bm.id}
                    className="p-1.5 rounded-lg text-[#555] hover:text-[#ef4444] transition-colors"
                    title="Delete bookmark"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
