import { useEffect, useState } from "react";
import * as mammoth from "mammoth";
import { Link } from "react-router-dom";
import {
  batchUpsertChapters,
  deleteAllChapters,
  deleteChapter,
  getStory,
  getChapterMetas,
} from "../data/db";

/** ===== Helpers: split chapters ===== */
function splitChapters(text: string) {
  // Normalize line endings and trim noisy blank space.
  const t = text.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ").trim();

  // More robust detector:
  // - Anchor at line start
  // - Accept: "Chương 12", "CHUONG 12", "Chapter 12"
  // - Title can be on the same line OR the next line.
  const headingRe = /^\s*(chapter|chuong|chương)\s+(\d{1,5})\s*(?:[:.\-–—])?\s*(.*)\s*$/i;

  const lines = t.split("\n");
  const headings: Array<{ lineIndex: number; chapNo: string; title: string }> = [];

  const cleanTitle = (s: string) =>
    (s || "")
      .trim()
      .replace(/^[\s:._\-–—]+/g, "")
      .replace(/[\s:._\-–—]+$/g, "")
      .trim();

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(headingRe);
    if (!m) continue;

    const chapNo = String(Number(m[2])); // remove leading zeros, keep numeric
    let title = cleanTitle(m[3] || "");

    // If title is empty, try to use the next non-empty line as title.
    if (!title) {
      const next = lines[i + 1] ?? "";
      const nextTrim = cleanTitle(next);
      // Avoid swallowing the next heading line as title.
      if (nextTrim && !headingRe.test(nextTrim)) {
        title = nextTrim;
      }
    }

    headings.push({ lineIndex: i, chapNo, title });
  }

  if (headings.length === 0) {
    return [{ id: "1", title: "Chapter 1", content: t }];
  }

  // Build chapter blocks by slicing line ranges.
  const out: Array<{ id: string; title: string; content: string }> = [];
  for (let i = 0; i < headings.length; i++) {
    const startLine = headings[i].lineIndex;
    const endLine = i + 1 < headings.length ? headings[i + 1].lineIndex : lines.length;

    const chunkLines = lines.slice(startLine, endLine);
    const id = headings[i].chapNo;

    // Remove heading line itself from content.
    chunkLines.shift();
    // If we used next line as title, also remove it from content when it is exactly that title.
    if (headings[i].title && chunkLines.length) {
      const first = cleanTitle(chunkLines[0]);
      if (first && first === headings[i].title) chunkLines.shift();
    }

    const title = headings[i].title ? `Chapter ${id}: ${headings[i].title}` : `Chapter ${id}`;
    const content = chunkLines.join("\n").trim();

    out.push({ id, title, content });
  }

  return out;
}

/** ===== DOCX -> Text (giữ TABLE => KHUNG) ===== */
function normalizeText(s: string) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nodeTextWithBreaks(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";

  let out = "";
  for (const child of Array.from(el.childNodes)) out += nodeTextWithBreaks(child);
  if (tag === "p" || tag === "div" || tag === "li") out = out.trimEnd() + "\n";
  return out;
}

function extractLinesFromElement(el: Element): string[] {
  const raw = nodeTextWithBreaks(el).replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n");
  return raw
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function tableToBlockquote(table: HTMLTableElement): string {
  const lines: string[] = [];
  const rows = Array.from(table.querySelectorAll("tr"));

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td,th"));
    for (const cell of cells) {
      const cellLines = extractLinesFromElement(cell);
      for (const ln of cellLines) lines.push(ln);
    }
  }

  if (!lines.length) return "";
  return lines.map((ln) => `> ${ln}`).join("\n");
}

function htmlToStoryText(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  const blocks: string[] = [];
  const children = Array.from(body.children);

  for (const child of children) {
    const tag = child.tagName.toLowerCase();

    if (tag === "table") {
      const q = tableToBlockquote(child as HTMLTableElement);
      if (q) blocks.push(q);
      continue;
    }

    if (tag === "p" || tag === "div") {
      const lines = extractLinesFromElement(child);
      if (lines.length) blocks.push(lines.join("\n"));
      continue;
    }

    const fallback = extractLinesFromElement(child);
    if (fallback.length) blocks.push(fallback.join("\n"));
  }

  return normalizeText(blocks.join("\n\n"));
}

async function readDocxToText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value || "";
  const text = htmlToStoryText(html);
  return text.trim();
}

export default function Admin() {
  const storyId = "1"; // bạn đang có 1 truyện

  const [msg, setMsg] = useState("");
  const [importInfo, setImportInfo] = useState<{ files: number; chapters: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const [storyTitle, setStoryTitle] = useState<string>("Admin");
  const [chapters, setChapters] = useState<Array<{ id: string; title: string }>>([]);

  async function reloadAll() {
    const story = await getStory(storyId);
    setStoryTitle(story?.title ?? "Admin");

    const chs = await getChapterMetas(storyId);
    setChapters(chs.map((c) => ({ id: c.id, title: c.title })));
  }

  // ✅ đúng hook: load 1 lần
  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFiles(files: FileList) {
    setMsg("");
    setImportInfo(null);

    const list = Array.from(files);
    if (!list.length) return;

    setBusy(true);
    try {
      let totalChapters = 0;
      let importedFiles = 0;

      for (const file of list) {
        const ext = file.name.toLowerCase().split(".").pop();
        if (ext === "doc") continue;
        if (ext !== "docx") continue;

        const rawText = await readDocxToText(file);
        if (!rawText) continue;

        const chs = splitChapters(rawText);

        // Detect duplicate chapter numbers (often happens if the doc has a table-of-contents or repeated headers).
        const seen = new Map<string, number>();
        for (const c of chs) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
        const dups = Array.from(seen.entries())
          .filter(([, n]) => n > 1)
          .map(([id, n]) => `${id}×${n}`);
        if (dups.length) {
          setMsg(
            `⚠️ File "${file.name}" có chapter bị trùng số: ${dups.join(", ")}. ` +
              `Firestore sẽ ghi đè (chapter trùng id chỉ còn 1). Bạn nên xoá mục lục/headers trong doc hoặc mình sẽ đổi sang auto re-number.`
          );
        }

        // ✅ batch write 1 lần / file
        await batchUpsertChapters(storyId, chs);

        totalChapters += chs.length;
        importedFiles += 1;
      }

      setImportInfo({ files: importedFiles, chapters: totalChapters });

      if (importedFiles === 0) {
        setMsg("❌ Không có file .docx hợp lệ để import (file .doc không hỗ trợ).");
      } else {
        setMsg(`✅ Import xong: ${importedFiles} file • ${totalChapters} chapter`);
      }

      await reloadAll();
    } catch (e: any) {
      setMsg(`❌ Lỗi import: ${e?.message ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAll() {
    setBusy(true);
    try {
      await deleteAllChapters(storyId);
      setMsg("🗑️ Đã xoá tất cả chương");
      setImportInfo(null);
      await reloadAll();
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteOne(chapterId: string) {
    setBusy(true);
    try {
      await deleteChapter(storyId, chapterId);
      setMsg(`🗑️ Đã xoá chapter ${chapterId}`);
      await reloadAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{storyTitle || "Admin"}</h1>
          <p className="text-slate-600">Upload .docx để import chương · Quản lí chương</p>
        </div>

        <Link
          to="/"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Về trang chủ
        </Link>
      </div>

      {msg && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">{msg}</div>
      )}

      {/* Upload */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Upload file .docx</div>
          {busy && <div className="text-xs font-semibold text-slate-500">Đang import...</div>}
        </div>

        <input
          type="file"
          multiple
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length) handleFiles(files);
            e.currentTarget.value = "";
          }}
          className="block w-full text-sm"
        />

        {importInfo && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold">Import report</div>
            <div>Files imported: {importInfo.files}</div>
            <div>Total chapters: {importInfo.chapters}</div>
          </div>
        )}

        <div className="text-xs text-slate-500">
          * Chọn nhiều file một lần. Chỉ file <b>.docx</b> được import (file <b>.doc</b> sẽ bị bỏ qua).
          <br />
          * Tiêu đề chương nên dạng “Chapter 1 …” hoặc “Chương 1 …”.
          <br />
          * Bảng trong Word sẽ được tự convert thành khung bằng <b>&gt;</b> (blockquote).
        </div>
      </section>

      {/* Chapter list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">Danh sách chương</div>
            <div className="text-xs text-slate-500">Tổng: {chapters.length}</div>
          </div>

          <button
            onClick={onDeleteAll}
            disabled={busy}
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Xoá tất cả
          </button>
        </div>

        {!chapters.length ? (
          <div className="text-sm text-slate-600">Chưa có chapter.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((c) => (
              <div key={c.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{c.title}</div>
                    <div className="mt-1 text-xs text-slate-500">ID: {c.id}</div>
                  </div>

                  <button
                    onClick={() => onDeleteOne(c.id)}
                    disabled={busy}
                    className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
