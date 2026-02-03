import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

// ✅ Firestore DB
import { getStory, listenChapters } from "../data/db";
import type { Chapter, Story } from "../data/db";

// ✅ Auth
import { useAuth } from "../AuthProvider";

type ReaderProgress = {
  lastChapterId: string;
  updatedAt?: number;
};

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default function Home() {
  const { user, loading: authLoading, login, logout } = useAuth();

  const storyId = "1";

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await getStory(storyId);
        if (!mounted) return;
        setStory(s ?? null);
      } finally {
        if (mounted) setDbLoading(false); // ✅ tránh kẹt loading
      }
    })();

    const unsub = listenChapters(storyId, (chs) => {
      if (!mounted) return;
      setChapters(chs);
    });

    return () => {
      mounted = false;
      unsub?.();
    };
  }, [storyId]);

  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => Number(a.id) - Number(b.id));
  }, [chapters]);

  // ---------- Search + Pagination ----------
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return sortedChapters;
    return sortedChapters.filter(
      (c) =>
        String(c.id) === query || (c.title ?? "").toLowerCase().includes(query)
    );
  }, [sortedChapters, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  function onChangeQuery(v: string) {
    setQ(v);
    setPage(1);
  }

  const startNo = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const endNo = Math.min(safePage * pageSize, filtered.length);

  // ---------- Description more / less ----------
  const [descExpanded, setDescExpanded] = useState(false);
  const descRef = useRef<HTMLDivElement | null>(null);
  const [descHeight, setDescHeight] = useState(0);
  const COLLAPSED_HEIGHT = 72;

  useEffect(() => {
    if (!descRef.current) return;
    const el = descRef.current;

    const measure = () => setDescHeight(el.scrollHeight);
    measure();

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [story?.description]);

  const canToggleDesc = descHeight > COLLAPSED_HEIGHT + 8;

  // ---------- Split chapters: left (odd) | right (even) ----------
  const leftCol = useMemo(
    () => pageItems.filter((c) => Number(c.id) % 2 === 1),
    [pageItems]
  );
  const rightCol = useMemo(
    () => pageItems.filter((c) => Number(c.id) % 2 === 0),
    [pageItems]
  );

  // ---------- Continue reading ----------
  const continueTo = useMemo(() => {
    const progressKey = `sr:reader:progress:${storyId}`;
    const saved = safeParse<ReaderProgress>(localStorage.getItem(progressKey));
    const savedId = saved?.lastChapterId ? String(saved.lastChapterId) : null;

    const fallback = sortedChapters?.[0]?.id
      ? String(sortedChapters[0].id)
      : "1";

    if (!savedId) return fallback;
    const exists = sortedChapters.some((c) => String(c.id) === savedId);
    return exists ? savedId : fallback;
  }, [storyId, sortedChapters]);

  if (dbLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600">
        Đang tải dữ liệu…
      </div>
    );
  }

  if (!story) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600">
        Không tìm thấy truyện (storyId = {storyId}). Hãy tạo doc `stories/1` trên
        Firestore.
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        {/* HERO */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Cover */}
          <div className="w-full md:w-[260px] shrink-0">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <img
                src="/covers/overgeared.jpg"
                alt={story.title}
                className="h-[340px] w-full object-cover"
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="text-3xl font-bold text-slate-900">{story.title}</h1>

              <div className="flex items-center gap-2">
                {/* ADMIN luôn hiện */}
                <Link
                  to="/admin"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
                  title="Upload/Import chương"
                >
                  ADMIN
                </Link>

                {authLoading ? (
                  <div className="text-sm text-slate-500">Đang tải…</div>
                ) : user ? (
                  <>
                    {user.photoURL && (
                      <img
                        src={user.photoURL}
                        alt="avatar"
                        className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                      />
                    )}
                    <div className="hidden sm:block text-sm font-semibold text-slate-700 max-w-[240px] truncate">
                      {user.displayName || user.email}
                    </div>

                    <button
                      onClick={logout}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
                      title={user.email ?? "Đã đăng nhập"}
                    >
                      Đăng xuất
                    </button>
                  </>
                ) : (
                  <button
                    onClick={login}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    title="Đăng nhập để đồng bộ giữa các thiết bị"
                  >
                    Đăng nhập
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Tác giả:</span>{" "}
              {story.author ?? "—"}
            </div>

            {story.description && (
              <div className="mt-3">
                <div
                  className="relative overflow-hidden transition-[max-height] duration-300"
                  style={{
                    maxHeight: descExpanded ? descHeight : COLLAPSED_HEIGHT,
                  }}
                >
                  <div
                    ref={descRef}
                    className="whitespace-pre-wrap text-sm leading-6 text-slate-700"
                  >
                    {story.description}
                  </div>

                  {!descExpanded && canToggleDesc && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>

                {canToggleDesc && (
                  <button
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-1 text-sm font-medium text-blue-600 hover:underline"
                  >
                    {descExpanded ? "Thu gọn" : "Xem thêm"}
                  </button>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={`/read/${storyId}/${sortedChapters?.[0]?.id ?? "1"}`}
                className="inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
              >
                BẮT ĐẦU ĐỌC
              </Link>

              <Link
                to={`/read/${storyId}/${continueTo}`}
                className="inline-flex rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
                title={`Tiếp tục chương ${continueTo}`}
              >
                TIẾP TỤC ĐỌC (Chương {continueTo})
              </Link>
            </div>
          </div>
        </div>

        {/* CHAPTER HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Danh sách chương</h2>
            <div className="mt-1 text-sm text-slate-600">
              {filtered.length} chương
              {filtered.length > 0 && ` • đang hiển thị ${startNo}–${endNo}`}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => onChangeQuery(e.target.value)}
              placeholder="Tìm chương (vd: 12)"
              className="w-full sm:w-[260px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Trước
              </button>

              <div className="text-sm font-semibold text-slate-700">
                {safePage} / {totalPages}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>
        </div>

        {/* CHAPTER LIST */}
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {pageItems.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Chưa có chương. Vào Admin để import.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x">
              <div className="divide-y">
                {leftCol.map((c) => (
                  <Link
                    key={c.id}
                    to={`/read/${storyId}/${c.id}`}
                    className="block px-4 py-3 hover:bg-slate-50 text-sm font-medium"
                  >
                    {c.title?.trim() ? c.title : `Chương ${c.id}`}
                  </Link>
                ))}
              </div>

              <div className="divide-y">
                {rightCol.map((c) => (
                  <Link
                    key={c.id}
                    to={`/read/${storyId}/${c.id}`}
                    className="block px-4 py-3 hover:bg-slate-50 text-sm font-medium"
                  >
                    {c.title?.trim() ? c.title : `Chương ${c.id}`}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
