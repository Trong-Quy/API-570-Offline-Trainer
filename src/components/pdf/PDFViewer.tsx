import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import * as pdfjs from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist";

// pdfjs v5 TextItem — not re-exported at root, declare locally
interface PdfTextItem {
  str: string;
  transform: number[];  // [a,b,c,d,x,y] — x,y is the origin in PDF user space
  width: number;
  height: number;
  hasEOL: boolean;
}
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Bookmark,
  Upload, FileText, Search, List, X, ChevronUp, ChevronDown,
  AlertCircle, Loader2, Languages, ClipboardPaste, Copy, StopCircle, ScanLine
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { PDF } from "../../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ── Types ─────────────────────────────────────────────────────────────────
interface PageTextItem {
  str: string;
  x: number;   // PDF user-space x (left edge of baseline)
  y: number;   // PDF user-space y (baseline)
  w: number;   // PDF user-space width
  h: number;   // PDF user-space height
}

interface PageText {
  full: string;           // concatenated text for full-text search
  items: PageTextItem[];  // positioned items for highlight rendering
  clauses: string[];      // detected API/ASME clause numbers
}

interface SearchResult {
  page: number;
  snippet: string;
  snippetMatchStart: number;
  snippetMatchLen: number;
  isClauseMatch: boolean;
}

// ── Clause detection ─────────────────────────────────────────────────────
// Matches: 6.1  |  6.1.2  |  304.1.1  |  331.1.3  |  A.1.2  etc.
const CLAUSE_RE = /\b([A-Z]?\d{1,3}(?:\.\d{1,3}){1,4})\b/g;
const isClauseQuery = (q: string) =>
  /^§?\s*[A-Z]?\d{1,3}(\.\d{1,3}){1,4}$/.test(q.trim());
const normalizeClause = (s: string) => s.replace(/^§\s*/, "").trim();

// ── PDFViewer ─────────────────────────────────────────────────────────────
export function PDFViewer() {
  const { pdfs, loadPdfs, loadBookmarks, activePdf, setActivePdf, settings, aiStatus } = useAppStore();

  // ── PDF state ─────────────────────────────────────────────────────────
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pageInput, setPageInput] = useState("1");
  const [rendering, setRendering] = useState(false);
  const [showPdfList, setShowPdfList] = useState(!activePdf);

  // ── Bookmarks ─────────────────────────────────────────────────────────
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [showBookmarkForm, setShowBookmarkForm] = useState(false);

  // ── Text index ────────────────────────────────────────────────────────
  const [textIndex, setTextIndex] = useState<Map<number, PageText>>(new Map());
  const [clauseIndex, setClauseIndex] = useState<Map<string, number>>(new Map()); // clause → first page
  const [indexing, setIndexing] = useState(false);
  const [indexedPages, setIndexedPages] = useState(0);
  const indexAbort = useRef<AbortController | null>(null);

  // ── Search ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Translate panel ───────────────────────────────────────────────────
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateInput, setTranslateInput] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateResult, setTranslateResult] = useState("");
  const translateAbort = useRef<AbortController | null>(null);

  // ── Pipeline ──────────────────────────────────────────────────────────
  const [ocring, setOcring] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<"idle" | "ocr" | "cleanup" | "translate">("idle");
  const ocrAbort = useRef<AbortController | null>(null);
  const OCR_MODELS = ["minicpm-v:8b", "llava:13b"];

  const ocrCurrentPage = async () => {
    if (!canvasRef.current || ocring || aiStatus !== "online") return;
    setOcring(true);
    setTranslateInput("");
    setTranslateResult("");
    ocrAbort.current = new AbortController();
    const signal = ocrAbort.current.signal;

    // Resize canvas to max 1400px
    const src = canvasRef.current;
    const ratio = Math.min(1, 1400 / src.width);
    const off = document.createElement("canvas");
    off.width = Math.round(src.width * ratio);
    off.height = Math.round(src.height * ratio);
    off.getContext("2d")!.drawImage(src, 0, 0, off.width, off.height);
    const base64 = off.toDataURL("image/jpeg", 0.88).split(",")[1];

    try {
      // Stage 1: OCR
      setPipelineStage("ocr");
      let rawText = "";
      for (const ocrModel of OCR_MODELS) {
        if (signal.aborted) break;
        try {
          rawText = await streamOllama(
            ocrModel,
            "Extract ALL text from this document image exactly as it appears. Preserve paragraph structure, line breaks, headings, and numbering. Output ONLY the extracted text with no commentary.",
            signal,
            (t) => setTranslateInput(t),
            [base64],
          );
          if (rawText.trim()) break;
        } catch (e: any) {
          if (e.name === "AbortError") throw e;
        }
      }
      if (!rawText.trim() || signal.aborted) return;

      // Stage 2: Cleanup
      setPipelineStage("cleanup");
      const cleaned = await runCleanup(rawText, signal);
      if (signal.aborted) return;

      // Stage 3: Translate
      setPipelineStage("translate");
      await runTranslate(cleaned, signal);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setTranslateInput("Pipeline thất bại. Kiểm tra minicpm-v:8b và Ollama đang chạy.");
      }
    } finally {
      setOcring(false);
      setPipelineStage("idle");
    }
  };

  // Shared streaming helper — returns full text, calls onChunk for each token
  const streamOllama = async (
    model: string,
    prompt: string,
    signal: AbortSignal,
    onChunk: (full: string) => void,
    images?: string[],
  ): Promise<string> => {
    const body: Record<string, unknown> = { model, prompt, stream: true };
    if (images?.length) body.images = images;
    const res = await fetch(`${settings.aiEndpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) { full += obj.response; onChunk(full); }
          if (obj.done) return full;
        } catch { /* skip */ }
      }
    }
    return full;
  };

  const loadPageText = useCallback(() => {
    const data = textIndex.get(currentPage);
    setTranslateInput(data?.full ?? "");
    setTranslateResult("");
  }, [textIndex, currentPage]);

  // Auto-reload translate text when page changes or indexing finishes
  useEffect(() => {
    if (showTranslate) loadPageText();
  }, [currentPage, showTranslate, loadPageText]);

  // Stage 2: Cleanup OCR text with deepseek-r1
  const runCleanup = async (rawText: string, signal: AbortSignal): Promise<string> => {
    const prompt = `You are cleaning up OCR-extracted text from a technical API/ASME document. Fix:
- Broken words split across lines (e.g. "cor- rosion" → "corrosion")
- Wrong characters from OCR errors
- Restore paragraph structure and headings
- Keep ALL clause numbers, measurements, and technical terms exactly
Output ONLY the cleaned text, nothing else:\n\n${rawText}`;
    return streamOllama(settings.cleanupModel, prompt, signal, (t) => setTranslateInput(t));
  };

  // Stage 3: Translate with translateModel
  const runTranslate = async (text: string, signal: AbortSignal): Promise<void> => {
    const prompt = `Translate the following technical API/ASME piping inspection document to Vietnamese. Rules:
- Preserve ALL clause numbers (e.g. 6.1.2), measurements, unit abbreviations exactly
- Keep technical terms in English on first use, add Vietnamese in parentheses
- Maintain document structure (headings, lists, paragraphs)
Output ONLY the Vietnamese translation:\n\n${text}`;
    await streamOllama(settings.translateModel, prompt, signal, (t) => setTranslateResult(t));
  };

  // Full pipeline: Cleanup → Translate (for digital PDFs)
  const translateWithAI = async () => {
    const text = translateInput.trim();
    if (!text || translating || aiStatus !== "online") return;
    setTranslating(true);
    setTranslateResult("");
    translateAbort.current = new AbortController();
    const signal = translateAbort.current.signal;
    try {
      // Cleanup stage
      setPipelineStage("cleanup");
      const cleaned = await runCleanup(text, signal);
      if (signal.aborted) return;

      // Translate stage
      setPipelineStage("translate");
      await runTranslate(cleaned, signal);
    } catch (e: any) {
      if (e.name !== "AbortError") setTranslateResult("Lỗi pipeline. Kiểm tra Ollama đang chạy.");
    } finally {
      setTranslating(false);
      setPipelineStage("idle");
    }
  };

  // ── Canvas / viewport ─────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<pdfjs.RenderTask | null>(null);
  const currentViewport = useRef<PageViewport | null>(null);

  // ── Indexing ─────────────────────────────────────────────────────────
  const buildIndex = useCallback(async (doc: pdfjs.PDFDocumentProxy, signal: AbortSignal) => {
    setIndexing(true);
    setIndexedPages(0);
    const newTextIndex = new Map<number, PageText>();
    const newClauseIndex = new Map<string, number>();

    for (let p = 1; p <= doc.numPages; p++) {
      if (signal.aborted) break;
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();

        const items: PageTextItem[] = [];
        const parts: string[] = [];

        for (const item of content.items) {
          if (!("str" in item)) continue;
          const ti = item as PdfTextItem;
          if (!ti.str.trim() && !ti.hasEOL) continue;

          const [, , , , x, y] = ti.transform;
          items.push({ str: ti.str, x, y, w: ti.width, h: ti.height || 10 });
          parts.push(ti.str);
        }

        const full = parts.join(" ");
        const clauses: string[] = [];
        let m: RegExpExecArray | null;
        CLAUSE_RE.lastIndex = 0;
        while ((m = CLAUSE_RE.exec(full)) !== null) {
          const c = m[1];
          clauses.push(c);
          if (!newClauseIndex.has(c)) newClauseIndex.set(c, p);
        }

        newTextIndex.set(p, { full, items, clauses });
      } catch { /* skip pages that fail */ }

      setIndexedPages(p);
    }

    if (!signal.aborted) {
      setTextIndex(newTextIndex);
      setClauseIndex(newClauseIndex);
    }
    setIndexing(false);
  }, []);

  // ── Render page + draw highlights ─────────────────────────────────────
  const renderPage = useCallback(async (
    doc: pdfjs.PDFDocumentProxy,
    pageNum: number,
    s: number,
    query: string,
    results: SearchResult[],
  ) => {
    if (!canvasRef.current) return;
    if (renderTask.current) { renderTask.current.cancel(); renderTask.current = null; }
    setRendering(true);
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: s });
      currentViewport.current = viewport;
      const canvas = canvasRef.current;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const ctx = canvas.getContext("2d")!;
      renderTask.current = page.render({ canvas, canvasContext: ctx, viewport });
      await renderTask.current.promise;

      // Draw highlights if there are matches on this page
      if (query.trim().length > 1) {
        drawHighlights(ctx, viewport, pageNum, query, results);
      }
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error("Render error:", e);
    } finally {
      setRendering(false);
    }
  }, []);

  // ── Highlight overlay ─────────────────────────────────────────────────
  const drawHighlights = (
    ctx: CanvasRenderingContext2D,
    viewport: PageViewport,
    pageNum: number,
    query: string,
    results: SearchResult[],
  ) => {
    const pageData = textIndex.get(pageNum);
    if (!pageData) return;

    const q = query.toLowerCase().trim();
    const pageHasMatch = results.some(r => r.page === pageNum);
    if (!pageHasMatch) return;

    ctx.save();
    for (const item of pageData.items) {
      if (!item.str.toLowerCase().includes(q)) continue;

      // Convert PDF user-space coords to canvas coords
      const [vx, vy] = viewport.convertToViewportPoint(item.x, item.y);
      const vw = item.w * viewport.scale;
      const vh = Math.max(item.h * viewport.scale, 10);

      ctx.fillStyle = "rgba(245, 200, 66, 0.35)";
      ctx.strokeStyle = "rgba(245, 200, 66, 0.8)";
      ctx.lineWidth = 1;
      // vy is the baseline; subtract height to get top of glyph
      ctx.fillRect(vx, vy - vh, vw, vh);
      ctx.strokeRect(vx, vy - vh, vw, vh);
    }
    ctx.restore();
  };

  // ── Search logic ──────────────────────────────────────────────────────
  const runSearch = useCallback((q: string) => {
    const raw = q.trim();
    if (raw.length < 2) { setSearchResults([]); setActiveResult(0); return; }

    const results: SearchResult[] = [];
    const lower = raw.toLowerCase();
    const clauseQ = normalizeClause(raw);
    const isClause = isClauseQuery(raw);

    // Clause jump: check exact match first
    if (isClause && clauseIndex.has(clauseQ)) {
      const page = clauseIndex.get(clauseQ)!;
      const pageData = textIndex.get(page);
      const snippet = pageData ? makeSnippet(pageData.full, clauseQ, 80) : { text: `Clause ${clauseQ}`, start: 7, len: clauseQ.length };
      results.push({ page, snippet: snippet.text, snippetMatchStart: snippet.start, snippetMatchLen: snippet.len, isClauseMatch: true });
    }

    // Also try partial clause prefix (e.g. "6.1" matches "6.1.2", "6.1.3" …)
    if (isClause) {
      for (const [clause, page] of clauseIndex) {
        if (clause.startsWith(clauseQ) && clause !== clauseQ) {
          const pageData = textIndex.get(page);
          const snippet = pageData ? makeSnippet(pageData.full, clause, 80) : { text: clause, start: 0, len: clause.length };
          if (!results.find(r => r.page === page)) {
            results.push({ page, snippet: snippet.text, snippetMatchStart: snippet.start, snippetMatchLen: snippet.len, isClauseMatch: true });
          }
        }
      }
    }

    // Full-text search across all indexed pages
    for (const [page, data] of textIndex) {
      if (!data.full.toLowerCase().includes(lower)) continue;
      if (results.find(r => r.page === page)) continue; // already listed from clause match
      const snippet = makeSnippet(data.full, lower, 90);
      results.push({ page, snippet: snippet.text, snippetMatchStart: snippet.start, snippetMatchLen: snippet.len, isClauseMatch: false });
    }

    // Sort: clause matches first, then by page number
    results.sort((a, b) => {
      if (a.isClauseMatch && !b.isClauseMatch) return -1;
      if (!a.isClauseMatch && b.isClauseMatch) return 1;
      return a.page - b.page;
    });

    setSearchResults(results.slice(0, 100));
    setActiveResult(0);
    setShowResults(true);
  }, [textIndex, clauseIndex]);

  const makeSnippet = (text: string, query: string, radius: number): { text: string; start: number; len: number } => {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) return { text: text.slice(0, radius * 2), start: 0, len: 0 };
    const from = Math.max(0, idx - radius);
    const to = Math.min(text.length, idx + q.length + radius);
    const snippet = (from > 0 ? "…" : "") + text.slice(from, to) + (to < text.length ? "…" : "");
    const adjustedStart = idx - from + (from > 0 ? 1 : 0); // +1 for "…"
    return { text: snippet, start: adjustedStart, len: q.length };
  };

  // ── Effects ───────────────────────────────────────────────────────────
  // Re-render when page, scale, or search results change
  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage, scale, searchQuery, searchResults);
  }, [pdfDoc, currentPage, scale, searchQuery, searchResults, renderPage]);

  // Sync page input display
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);

  // Debounce search on query change
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => runSearch(searchQuery), 200);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery, runSearch]);

  // ── Page navigation ───────────────────────────────────────────────────
  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(clamped);
    if (activePdf) invoke("update_pdf_last_page", { pdfId: activePdf.id, page: clamped }).catch(() => {});
  };

  const goToResult = (idx: number) => {
    const result = searchResults[idx];
    if (!result) return;
    setActiveResult(idx);
    goToPage(result.page);
  };

  // Navigate between results with Enter
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length > 0) {
        const next = (activeResult + 1) % searchResults.length;
        goToResult(next);
      }
    }
    if (e.key === "Escape") {
      setSearchQuery("");
      setShowResults(false);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchResults.length > 0) goToResult(Math.min(activeResult + 1, searchResults.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchResults.length > 0) goToResult(Math.max(activeResult - 1, 0));
    }
  };

  // ── Open PDF ──────────────────────────────────────────────────────────
  const openPdf = async (pdf: PDF) => {
    // Cancel any running index build
    if (indexAbort.current) indexAbort.current.abort();

    try {
      setRendering(true);
      setTextIndex(new Map());
      setClauseIndex(new Map());
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);

      const doc = await pdfjs.getDocument(convertFileSrc(pdf.path)).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      const startPage = Math.min(pdf.lastPage || 1, doc.numPages);
      setCurrentPage(startPage);
      setActivePdf(pdf);
      setShowPdfList(false);

      // Start background indexing
      const abort = new AbortController();
      indexAbort.current = abort;
      buildIndex(doc, abort.signal);
    } catch (e) {
      alert("Failed to open PDF. Check the file exists at: " + pdf.path);
    } finally {
      setRendering(false);
    }
  };

  const importPdf = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (!selected) return;
      const path = selected as string;
      const name = path.split("/").pop()?.replace(".pdf", "") || path;
      await invoke("add_pdf", { name, path });
      await loadPdfs();
    } catch (e) { console.error("Import failed:", e); }
  };

  const deletePdf = async (pdf: PDF, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Xóa "${pdf.name}" khỏi thư viện?\n(File PDF gốc sẽ không bị xóa)`)) return;
    try {
      await invoke("delete_pdf", { pdfId: pdf.id });
      await loadPdfs();
      if (activePdf?.id === pdf.id) setActivePdf(null as any);
    } catch (e) { console.error("Delete failed:", e); }
  };

  const addBookmark = async () => {
    if (!activePdf) return;
    try {
      await invoke("add_bookmark", { pdfName: activePdf.name, pdfPath: activePdf.path, page: currentPage, note: bookmarkNote || null, highlightText: null, color: "#f5c842" });
      await loadBookmarks();
      setShowBookmarkForm(false);
      setBookmarkNote("");
    } catch (e) { console.error("Bookmark failed:", e); }
  };

  // ── Index progress bar helper ─────────────────────────────────────────
  const indexPct = totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0;

  // ── Snippet renderer ──────────────────────────────────────────────────
  const renderSnippet = (result: SearchResult) => {
    const { snippet, snippetMatchStart, snippetMatchLen } = result;
    if (snippetMatchLen === 0) return <span className="text-[#666]">{snippet}</span>;
    const before = snippet.slice(0, snippetMatchStart);
    const match = snippet.slice(snippetMatchStart, snippetMatchStart + snippetMatchLen);
    const after = snippet.slice(snippetMatchStart + snippetMatchLen);
    return (
      <span className="text-[#888]">
        {before}
        <mark className="bg-[#f5c842]/40 text-[#e5e5e5] rounded px-0.5 not-italic">{match}</mark>
        {after}
      </span>
    );
  };

  // ── PDF Library view ──────────────────────────────────────────────────
  if (showPdfList || !activePdf) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0a]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
          <h2 className="text-[#e5e5e5] font-semibold">Codebook Library</h2>
          <button onClick={importPdf} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f5c842]/10 border border-[#f5c842]/30 text-[#f5c842] text-sm hover:bg-[#f5c842]/20 transition-colors">
            <Upload size={14} /> Import PDF
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {pdfs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <FileText size={48} className="text-[#333] mb-4" />
              <p className="text-[#666] font-medium mb-1">No codebooks imported yet</p>
              <p className="text-[#444] text-sm mb-4">Import your legally obtained API/ASME PDFs</p>
              <button onClick={importPdf} className="px-5 py-2.5 rounded-xl bg-[#f5c842] text-black font-semibold text-sm hover:bg-[#e5b832]">Import First PDF</button>
              <div className="mt-6 text-[#333] text-xs space-y-1">
                <p>Supported: API 570, 571, 574, 577, 578</p>
                <p>ASME B31.3, Sec V, Sec IX, B16.5, PCC-2</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {pdfs.map((pdf) => (
                <div key={pdf.id} className="relative group">
                  <button
                    onClick={() => openPdf(pdf)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl p-4 text-left hover:border-[#f5c842]/30 transition-colors"
                  >
                    <FileText size={24} className="text-[#818cf8] mb-3" />
                    <p className="text-[#e5e5e5] text-sm font-medium group-hover:text-[#f5c842] pr-6">{pdf.name}</p>
                    <p className="text-[#555] text-xs mt-1">Last page: {pdf.lastPage}</p>
                  </button>
                  <button
                    onClick={(e) => deletePdf(pdf, e)}
                    title="Xóa khỏi thư viện"
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#555] hover:bg-[#ef4444]/15 hover:border-[#ef4444]/40 hover:text-[#ef4444] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button onClick={importPdf} className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-xl p-4 flex flex-col items-center justify-center hover:border-[#3a3a3a] transition-colors">
                <Upload size={20} className="text-[#444] mb-2" />
                <span className="text-[#555] text-xs">Add PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main viewer ───────────────────────────────────────────────────────
  const resultCount = searchResults.length;
  const currentResultPage = searchResults[activeResult]?.page;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">

        {/* PDF name / back to library */}
        <button onClick={() => setShowPdfList(true)} className="flex items-center gap-1.5 text-[#777] hover:text-[#e5e5e5] text-xs transition-colors shrink-0 max-w-[140px] truncate">
          <List size={13} />
          <span className="truncate">{activePdf.name}</span>
        </button>

        <div className="w-px h-4 bg-[#2a2a2a]" />

        {/* Page navigation */}
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="text-[#666] hover:text-[#e5e5e5] disabled:opacity-30 p-0.5">
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToPage(Number(pageInput))}
            className="w-11 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-1 text-center text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f5c842]"
          />
          <span className="text-[#555] text-xs">/ {totalPages}</span>
        </div>
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="text-[#666] hover:text-[#e5e5e5] disabled:opacity-30 p-0.5">
          <ChevronRight size={15} />
        </button>

        <div className="w-px h-4 bg-[#2a2a2a]" />

        {/* Zoom */}
        <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2)))} className="text-[#666] hover:text-[#e5e5e5]"><ZoomOut size={14} /></button>
        <span className="text-[#555] text-[10px] w-9 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, +(s + 0.15).toFixed(2)))} className="text-[#666] hover:text-[#e5e5e5]"><ZoomIn size={14} /></button>

        <div className="flex-1" />

        {/* Index progress */}
        {indexing && (
          <div className="flex items-center gap-1.5 text-[#555] text-[10px] shrink-0">
            <Loader2 size={11} className="animate-spin text-[#818cf8]" />
            <span>Indexing {indexPct}%</span>
          </div>
        )}

        {/* Search box */}
        <div className="relative shrink-0">
          <div className={`flex items-center gap-2 bg-[#1a1a1a] border rounded-lg px-3 py-1.5 transition-colors ${searchQuery ? "border-[#f5c842]/50" : "border-[#2a2a2a]"}`}>
            <Search size={12} className={searchQuery ? "text-[#f5c842]" : "text-[#555]"} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={indexing ? "Indexing…" : "Search or type §6.1.2…"}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
              onKeyDown={handleSearchKeyDown}
              className="bg-transparent text-xs text-[#e5e5e5] placeholder-[#444] focus:outline-none w-44"
            />
            {searchQuery && (
              <>
                {resultCount > 0 && (
                  <span className="text-[10px] text-[#f5c842] shrink-0">
                    {activeResult + 1}/{resultCount}
                  </span>
                )}
                {resultCount === 0 && searchQuery.trim().length > 1 && !indexing && (
                  <span className="text-[10px] text-[#555] shrink-0">0 results</span>
                )}
                {/* Up/Down result navigation */}
                <button onClick={() => goToResult(Math.max(activeResult - 1, 0))} disabled={activeResult <= 0} className="text-[#555] hover:text-[#e5e5e5] disabled:opacity-20 p-0.5">
                  <ChevronUp size={11} />
                </button>
                <button onClick={() => goToResult(Math.min(activeResult + 1, resultCount - 1))} disabled={activeResult >= resultCount - 1} className="text-[#555] hover:text-[#e5e5e5] disabled:opacity-20 p-0.5">
                  <ChevronDown size={11} />
                </button>
                <button onClick={() => { setSearchQuery(""); setShowResults(false); }} className="text-[#444] hover:text-[#888] p-0.5">
                  <X size={11} />
                </button>
              </>
            )}
          </div>

          {/* Results dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1f1f1f] flex items-center justify-between">
                <span className="text-[10px] text-[#555]">
                  {resultCount} result{resultCount !== 1 ? "s" : ""}
                  {isClauseQuery(searchQuery) ? " — clause mode" : ""}
                </span>
                <button onClick={() => setShowResults(false)} className="text-[#444] hover:text-[#888]"><X size={11} /></button>
              </div>
              <div className="overflow-y-auto max-h-72">
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.page}-${idx}`}
                    onClick={() => { goToResult(idx); setShowResults(false); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-[#1a1a1a] last:border-0 transition-colors flex items-start gap-2 ${
                      idx === activeResult ? "bg-[#f5c842]/8" : "hover:bg-[#ffffff04]"
                    }`}
                  >
                    {/* Page badge */}
                    <div className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                      result.isClauseMatch
                        ? "bg-[#818cf8]/20 text-[#818cf8]"
                        : idx === activeResult
                          ? "bg-[#f5c842]/20 text-[#f5c842]"
                          : "bg-[#1f1f1f] text-[#555]"
                    }`}>
                      p.{result.page}
                    </div>
                    <div className="flex-1 min-w-0">
                      {result.isClauseMatch && (
                        <span className="text-[10px] text-[#818cf8] font-medium block mb-0.5">§ Clause jump</span>
                      )}
                      <p className="text-[11px] leading-relaxed line-clamp-2 italic">
                        {renderSnippet(result)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-[#1f1f1f] text-[10px] text-[#333]">
                ↑↓ navigate · Enter next · Esc close
              </div>
            </div>
          )}
        </div>

        {/* Translate button */}
        <button
          onClick={() => { setShowTranslate(v => !v); if (!showTranslate) loadPageText(); }}
          title="Dịch sang tiếng Việt"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
            showTranslate
              ? "border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/10"
              : "border-[#2a2a2a] text-[#777] hover:text-[#22c55e] hover:border-[#22c55e]/30"
          }`}
        >
          <Languages size={13} />
          <span className="text-[10px]">Dịch</span>
        </button>

        {/* Bookmark button */}
        <button
          onClick={() => setShowBookmarkForm(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2a2a2a] text-[#777] hover:text-[#f5c842] hover:border-[#f5c842]/30 text-xs transition-colors shrink-0"
        >
          <Bookmark size={12} />
        </button>
      </div>

      {/* Indexing progress bar */}
      {indexing && (
        <div className="h-0.5 bg-[#1a1a1a] shrink-0">
          <div className="h-full bg-[#818cf8]/60 transition-all duration-200" style={{ width: `${indexPct}%` }} />
        </div>
      )}

      {/* Clause search info banner — appears when search matches a specific clause */}
      {searchQuery && !indexing && textIndex.size > 0 && isClauseQuery(searchQuery) && clauseIndex.has(normalizeClause(searchQuery)) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#818cf8]/8 border-b border-[#818cf8]/20 shrink-0">
          <AlertCircle size={12} className="text-[#818cf8]" />
          <span className="text-[#818cf8] text-xs">
            Clause <strong>{normalizeClause(searchQuery)}</strong> found on page {clauseIndex.get(normalizeClause(searchQuery))}
          </span>
          <button
            onClick={() => goToPage(clauseIndex.get(normalizeClause(searchQuery))!)}
            className="ml-auto px-2 py-0.5 rounded bg-[#818cf8]/20 text-[#818cf8] text-[10px] font-medium hover:bg-[#818cf8]/30"
          >
            Jump →
          </button>
        </div>
      )}

      {/* Bookmark form */}
      {showBookmarkForm && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#111] border-b border-[#2a2a2a] shrink-0">
          <Bookmark size={13} className="text-[#f5c842]" />
          <input
            type="text"
            placeholder="Bookmark note (optional)…"
            value={bookmarkNote}
            onChange={e => setBookmarkNote(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") addBookmark(); if (e.key === "Escape") setShowBookmarkForm(false); }}
          />
          <button onClick={addBookmark} className="px-3 py-1 bg-[#f5c842] text-black text-xs font-semibold rounded">Save</button>
          <button onClick={() => setShowBookmarkForm(false)} className="text-[#555] text-xs px-2">Cancel</button>
        </div>
      )}

      {/* Page match indicator strip */}
      {searchQuery && searchResults.length > 0 && currentResultPage === currentPage && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#f5c842]/6 border-b border-[#f5c842]/15 shrink-0">
          <Search size={11} className="text-[#f5c842]" />
          <span className="text-[#f5c842] text-[10px]">Matches highlighted on this page</span>
          <span className="ml-auto text-[10px] text-[#888]">
            Result {activeResult + 1} of {resultCount} · page {currentPage}
          </span>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex-1 overflow-auto bg-[#1a1a1a] flex justify-center py-4 relative">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/40 z-10 pointer-events-none">
            <div className="w-7 h-7 border-2 border-[#f5c842] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="shadow-2xl"
          style={{ maxWidth: "100%", height: "auto" }}
        />
      </div>

      {/* Translate panel */}
      {showTranslate && (
        <div className="shrink-0 border-t border-[#22c55e]/20 bg-[#0d0d0d]" style={{ height: 300 }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <Languages size={13} className="text-[#22c55e]" />
              <span className="text-[11px] text-[#22c55e] font-medium">Dịch sang tiếng Việt</span>
              {pipelineStage !== "idle" ? (
                <div className="flex items-center gap-1.5 ml-1">
                  {(["ocr", "cleanup", "translate"] as const).map((s, i) => (
                    <span key={s} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[#333] text-[10px]">→</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                        pipelineStage === s
                          ? s === "ocr" ? "bg-[#f97316]/20 text-[#f97316]"
                            : s === "cleanup" ? "bg-[#818cf8]/20 text-[#818cf8]"
                            : "bg-[#22c55e]/20 text-[#22c55e]"
                          : "text-[#333]"
                      }`}>
                        {pipelineStage === s && <Loader2 size={9} className="animate-spin" />}
                        {s === "ocr" ? "OCR" : s === "cleanup" ? "Cleanup" : "Translate"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-[#444]">— chỉnh sửa văn bản bên trái trước khi dịch</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={loadPageText}
                title="Load lại text trang hiện tại"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#666] hover:text-[#e5e5e5] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
              >
                <ClipboardPaste size={10} /> Trang {currentPage}
              </button>
              {ocring ? (
                <button
                  onClick={() => { ocrAbort.current?.abort(); setOcring(false); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] bg-[#f97316]/15 text-[#f97316] border border-[#f97316]/30 hover:bg-[#f97316]/25 transition-colors"
                >
                  <StopCircle size={10} /> Dừng OCR
                </button>
              ) : (
                <button
                  onClick={ocrCurrentPage}
                  disabled={aiStatus !== "online"}
                  title="Dùng AI vision để trích xuất text từ ảnh (minicpm-v:8b)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] bg-[#f97316]/15 text-[#f97316] border border-[#f97316]/30 hover:bg-[#f97316]/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ScanLine size={10} /> OCR
                </button>
              )}
              {translating ? (
                <button
                  onClick={() => { translateAbort.current?.abort(); setTranslating(false); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30 hover:bg-[#ef4444]/25 transition-colors"
                >
                  <StopCircle size={10} /> Dừng
                </button>
              ) : (
                <button
                  onClick={translateWithAI}
                  disabled={!translateInput.trim() || aiStatus !== "online"}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 hover:bg-[#22c55e]/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Languages size={10} /> Dịch
                </button>
              )}
              <button onClick={() => setShowTranslate(false)} className="text-[#444] hover:text-[#888] p-0.5">
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="flex h-[calc(100%-37px)]">
            {/* Input — editable page text */}
            <div className="flex-1 flex flex-col border-r border-[#1a1a1a]">
              <div className="px-2 py-1 border-b border-[#1a1a1a] flex items-center justify-between">
                <span className="text-[10px] text-[#444]">Văn bản gốc (có thể chỉnh sửa)</span>
                {translateInput && (
                  <button
                    onClick={() => navigator.clipboard.writeText(translateInput)}
                    className="text-[#444] hover:text-[#888]"
                  >
                    <Copy size={10} />
                  </button>
                )}
              </div>
              {indexing && !textIndex.has(currentPage) && !translateInput && !ocring ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-[#444] text-[11px]">
                  <Loader2 size={12} className="animate-spin text-[#818cf8]" />
                  <span>Đang index trang {currentPage}… ({indexPct}%)</span>
                </div>
              ) : !textIndex.has(currentPage) && !translateInput && !ocring ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <ScanLine size={20} className="text-[#444]" />
                  <p className="text-[11px] text-[#555]">Trang này không có text layer (PDF scan)</p>
                  <button
                    onClick={ocrCurrentPage}
                    disabled={aiStatus !== "online"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] bg-[#f97316]/15 text-[#f97316] border border-[#f97316]/30 hover:bg-[#f97316]/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <ScanLine size={12} /> OCR trang này bằng AI
                  </button>
                  <p className="text-[10px] text-[#333]">minicpm-v:8b · chạy offline</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {ocring && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f97316]/8 border-b border-[#f97316]/20 shrink-0">
                      <Loader2 size={10} className="animate-spin text-[#f97316]" />
                      <span className="text-[10px] text-[#f97316]">OCR đang chạy… {translateInput.length} ký tự</span>
                    </div>
                  )}
                  <textarea
                    value={translateInput}
                    onChange={e => setTranslateInput(e.target.value)}
                    className="flex-1 bg-transparent text-[11px] text-[#888] placeholder-[#333] px-3 py-2 resize-none focus:outline-none leading-relaxed"
                    placeholder="Paste text vào đây để dịch…"
                  />
                </div>
              )}
            </div>
            {/* Output — translation result */}
            <div className="flex-1 flex flex-col">
              <div className="px-2 py-1 border-b border-[#1a1a1a] flex items-center justify-between">
                <span className="text-[10px] text-[#444]">Bản dịch tiếng Việt</span>
                {translateResult && (
                  <button
                    onClick={() => navigator.clipboard.writeText(translateResult)}
                    className="text-[#444] hover:text-[#888]"
                  >
                    <Copy size={10} />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {translating && !translateResult && (
                  <div className="flex items-center gap-2 text-[#444] text-[11px]">
                    <Loader2 size={11} className="animate-spin text-[#22c55e]" />
                    <span>Đang dịch…</span>
                  </div>
                )}
                {translateResult ? (
                  <p className="text-[11px] text-[#ccc] leading-relaxed whitespace-pre-wrap">{translateResult}</p>
                ) : !translating ? (
                  <p className="text-[11px] text-[#333] italic">Bản dịch sẽ xuất hiện ở đây…</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-[#1a1a1a] flex items-center gap-4 text-[10px] text-[#333] shrink-0">
        <span>← → Pages</span>
        <span>Ctrl+F Search</span>
        <span>Type §6.1 to jump to clause</span>
        {textIndex.size > 0 && (
          <span className="ml-auto text-[#2a2a2a]">
            {textIndex.size} pages indexed · {clauseIndex.size} clauses
          </span>
        )}
      </div>
    </div>
  );
}
