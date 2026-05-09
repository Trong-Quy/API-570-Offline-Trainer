import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, FileText, X, ChevronLeft, ChevronRight as ChevRight, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { useAppStore } from "../../store/appStore";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface Props {
  questionPanel: React.ReactNode;
  onClose: () => void;
}

export function DualPanelExam({ questionPanel, onClose }: Props) {
  const { pdfs, activePdf } = useAppStore();

  const [splitPct, setSplitPct] = useState(55); // question panel width %
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  // Load PDF on mount if one is already active
  useEffect(() => {
    if (activePdf) loadPdf(activePdf.path, activePdf.lastPage);
  }, []);

  const loadPdf = async (path: string, startPage = 1) => {
    try {
      setPdfLoading(true);
      const doc = await pdfjs.getDocument(path).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(Math.min(startPage, doc.numPages));
    } catch (e) {
      console.error("PDF load error:", e);
    } finally {
      setPdfLoading(false);
    }
  };

  const renderPage = useCallback(async (doc: pdfjs.PDFDocumentProxy, pageNum: number, s: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: s });
      const canvas = canvasRef.current;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const ctx = canvas.getContext("2d")!;
      renderTaskRef.current = page.render({ canvas, canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error(e);
    }
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage, scale);
  }, [pdfDoc, currentPage, scale, renderPage]);

  // Drag divider logic
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(30, Math.min(70, pct)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Dual-panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#888]">
          <FileText size={13} className="text-[#818cf8]" />
          <span>Open-Book Mode</span>
          <span className="text-[#444]">—</span>
          <span className="text-[#555]">Drag divider to resize panels</span>
        </div>
        <button onClick={onClose} className="flex items-center gap-1.5 text-[#555] hover:text-[#e5e5e5] text-xs transition-colors">
          <X size={13} />
          Close split view
        </button>
      </div>

      {/* Split panels */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden" style={{ cursor: dragging ? "col-resize" : "auto" }}>

        {/* Question panel */}
        <div className="overflow-hidden flex flex-col" style={{ width: `${splitPct}%`, minWidth: "30%" }}>
          {questionPanel}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-2 shrink-0 flex items-center justify-center cursor-col-resize bg-[#1a1a1a] hover:bg-[#f5c842]/20 transition-colors group relative z-10"
        >
          <GripVertical size={14} className="text-[#2a2a2a] group-hover:text-[#f5c842]/50 transition-colors" />
        </div>

        {/* PDF panel */}
        <div className="flex-1 flex flex-col border-l border-[#2a2a2a] overflow-hidden">
          {/* PDF toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
            {/* PDF selector */}
            <select
              onChange={e => { const pdf = pdfs.find(p => p.path === e.target.value); if (pdf) loadPdf(pdf.path); }}
              defaultValue={activePdf?.path ?? ""}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-[#888] focus:outline-none max-w-[160px] truncate"
            >
              <option value="">— Select PDF —</option>
              {pdfs.map(p => <option key={p.id} value={p.path}>{p.name}</option>)}
            </select>

            <div className="w-px h-3 bg-[#2a2a2a]" />

            {/* Page nav */}
            <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} className="text-[#666] hover:text-[#e5e5e5] disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-[#666] tabular-nums">{currentPage}/{totalPages || "—"}</span>
            <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} className="text-[#666] hover:text-[#e5e5e5] disabled:opacity-30">
              <ChevRight size={14} />
            </button>

            <div className="w-px h-3 bg-[#2a2a2a]" />

            {/* Zoom */}
            <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2)))} className="text-[#666] hover:text-[#e5e5e5]"><ZoomOut size={13} /></button>
            <span className="text-[10px] text-[#555] w-8 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(2.5, +(s + 0.15).toFixed(2)))} className="text-[#666] hover:text-[#e5e5e5]"><ZoomIn size={13} /></button>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto bg-[#111] flex justify-center p-3">
            {!pdfDoc && !pdfLoading && (
              <div className="flex flex-col items-center justify-center text-center h-full text-[#444]">
                <FileText size={32} className="mb-3 text-[#2a2a2a]" />
                <p className="text-sm">Select a codebook PDF above</p>
                <p className="text-xs mt-1 text-[#333]">Import PDFs in the Codebook view first</p>
              </div>
            )}
            {pdfLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-[#818cf8] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {pdfDoc && (
              <canvas ref={canvasRef} className="shadow-xl max-w-full" style={{ height: "auto" }} />
            )}
          </div>

          {/* Keyboard hint */}
          <div className="px-3 py-1.5 border-t border-[#1a1a1a] text-[10px] text-[#333] flex gap-3 shrink-0">
            <span>← → Pages</span>
            <span>Ctrl +/- Zoom</span>
            <span>Drag handle to resize</span>
          </div>
        </div>
      </div>
    </div>
  );
}
