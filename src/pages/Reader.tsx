import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ✅ Firestore DB
import { getChapter, getStory, listenChapters, type Chapter } from "../data/db";

// ✅ Sync progress/prefs by user
import { loadPrefs, loadProgress, savePrefs, saveProgress } from "../data/userSync";

// ✅ Firebase Auth UI
import { useAuth } from "../AuthProvider";

/* ===== Load Google Fonts ===== */
if (typeof document !== "undefined") {
  const fontLink = document.createElement("link");
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Lato:wght@400;700&family=Poppins:wght@400;500;600;700&display=swap";
  fontLink.rel = "stylesheet";
  if (!document.querySelector(`link[href*="fonts.googleapis.com"]`)) {
    document.head.appendChild(fontLink);
  }
}

/* ===== Utils ===== */
function normalizeContent(raw?: string) {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/^.*←.*trước.*bình.*luận.*kế.*→.*$/gim, "")
    .replace(/^\s*[-_=*~•·]{6,}\s*$/gm, "")
    .replace(/^\s*[\u2500-\u257F]{6,}\s*$/gm, "")
    .replace(/^\s*(\.{1,3}|…)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type ReaderTheme = "light" | "dark";
type ReaderFont =
  | "sans"
  | "noto"
  | "inter"
  | "roboto"
  | "opensans"
  | "lato"
  | "poppins";

function fontFamilyOf(font: ReaderFont) {
  switch (font) {
    case "noto":
      return `"Noto Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    case "inter":
      return `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    case "roboto":
      return `"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    case "opensans":
      return `"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    case "lato":
      return `"Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    case "poppins":
      return `"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    default:
      return `Arial, Helvetica, sans-serif`;
  }
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

type ReaderPrefs = {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  updatedAt?: number;
};

type ReaderProgress = {
  lastChapterId: string;
  updatedAt?: number;
};

/** ===== Stats helper ===== */
function splitStats(line: string) {
  const re = /([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\s]*:\s*[\d][\d./+\-%]*)/g;
  return line.match(re) ?? [];
}

/** ===== ReactNode -> text ===== */
function extractText(node: ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    // @ts-ignore
    return extractText(node.props.children);
  }
  return "";
}

export default function Reader() {
  const { user, loading: authLoading, login, logout } = useAuth();

  const params = useParams();
  const storyId = (params.storyId ?? "").trim();
  const chapterIdParam = params.chapterId; // undefined nếu /read/:storyId
  const navigate = useNavigate();

  // ✅ Firestore states
  const [story, setStory] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<any>(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(true);

  // normalize chapterId
  const chapterId = String(chapterIdParam ?? "1").trim();

  // localStorage keys
  const prefsKey = useMemo(
    () => `sr:reader:prefs:${storyId || "global"}`,
    [storyId]
  );
  const progressKey = useMemo(
    () => `sr:reader:progress:${storyId || "global"}`,
    [storyId]
  );

  // ===== STATE =====
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [font, setFont] = useState<ReaderFont>("sans");
  const [fontSize, setFontSize] = useState(18);

  const [prefsReady, setPrefsReady] = useState(false);

  // ===== UI =====
  const [openSettings, setOpenSettings] = useState(false);
  const [openToc, setOpenToc] = useState(false);
  const [tocQuery, setTocQuery] = useState("");
  const tocInputRef = useRef<HTMLInputElement | null>(null);
  const currentChapRef = useRef<HTMLButtonElement | null>(null);

  // ===== Load story + realtime chapters =====
  useEffect(() => {
    if (!storyId) return;

    let mounted = true;
    setDbLoading(true);

    (async () => {
      const s = await getStory(storyId);
      if (!mounted) return;
      setStory(s ?? null);
    })();

    const unsub = listenChapters(storyId, (chs) => {
      if (!mounted) return;
      setChapters(chs ?? []);
      setDbLoading(false);
    });

    return () => {
      mounted = false;
      unsub?.();
    };
  }, [storyId]);

  // ===== Load current chapter =====
  useEffect(() => {
    if (!storyId) return;
    setChapterLoading(true);

    let alive = true;
    (async () => {
      const ch = await getChapter(storyId, chapterId);
      if (!alive) return;
      setChapter(ch ?? null);
      setChapterLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [storyId, chapterId]);

  // ===== LOAD PREFS (local first) =====
  useEffect(() => {
    setPrefsReady(false);

    const savedPrefs = safeParse<Partial<ReaderPrefs>>(
      localStorage.getItem(prefsKey)
    );

    if (savedPrefs) {
      if (savedPrefs.theme === "light" || savedPrefs.theme === "dark") setTheme(savedPrefs.theme);
      if (
        savedPrefs.font === "sans" ||
        savedPrefs.font === "noto" ||
        savedPrefs.font === "inter" ||
        savedPrefs.font === "roboto" ||
        savedPrefs.font === "opensans" ||
        savedPrefs.font === "lato" ||
        savedPrefs.font === "poppins"
      ) setFont(savedPrefs.font);
      if (typeof savedPrefs.fontSize === "number") setFontSize(clamp(savedPrefs.fontSize, 14, 26));
    }

    setPrefsReady(true);
  }, [prefsKey]);

  // ===== SAVE PREFS (local + remote) =====
  useEffect(() => {
    if (!prefsReady) return;

    const payload: ReaderPrefs = {
      theme,
      font,
      fontSize: clamp(fontSize, 14, 26),
      updatedAt: Date.now(),
    };
    localStorage.setItem(prefsKey, JSON.stringify(payload));

    if (user?.uid && storyId) {
      savePrefs(user.uid, storyId, {
        theme,
        font,
        fontSize: clamp(fontSize, 14, 26),
      }).catch(() => {});
    }
  }, [theme, font, fontSize, prefsKey, prefsReady, user?.uid, storyId]);

  // ===== Merge prefs/progress after login (only when prefsReady) =====
  useEffect(() => {
    if (!prefsReady) return;
    if (!user?.uid || !storyId) return;

    (async () => {
      // ---- prefs
      const localPrefs = safeParse<ReaderPrefs>(localStorage.getItem(prefsKey));
      const remotePrefs = await loadPrefs(user.uid, storyId);

      const bestPrefs =
        !remotePrefs ? localPrefs :
        !localPrefs ? remotePrefs :
        ((localPrefs.updatedAt ?? 0) >= (remotePrefs.updatedAt ?? 0) ? localPrefs : remotePrefs);

      if (bestPrefs) {
        if (bestPrefs.theme) setTheme(bestPrefs.theme);
        if (bestPrefs.font) setFont(bestPrefs.font as any);
        if (typeof bestPrefs.fontSize === "number") setFontSize(bestPrefs.fontSize);

        if (bestPrefs === localPrefs && localPrefs) {
          await savePrefs(user.uid, storyId, {
            theme: localPrefs.theme,
            font: localPrefs.font,
            fontSize: localPrefs.fontSize,
          });
        } else if (remotePrefs) {
          localStorage.setItem(prefsKey, JSON.stringify(remotePrefs));
        }
      }

      // ---- progress
      const localProg = safeParse<ReaderProgress>(localStorage.getItem(progressKey));
      const remoteProg = await loadProgress(user.uid, storyId);

      const bestProg =
        !remoteProg ? localProg :
        !localProg ? remoteProg :
        ((localProg.updatedAt ?? 0) >= (remoteProg.updatedAt ?? 0) ? localProg : remoteProg);

      if (bestProg?.lastChapterId) {
        if (String(bestProg.lastChapterId).trim() !== String(chapterId)) {
          navigate(`/read/${storyId}/${String(bestProg.lastChapterId).trim()}`, { replace: true });
        }

        if (bestProg === localProg && localProg) {
          await saveProgress(user.uid, storyId, localProg.lastChapterId);
        } else if (remoteProg) {
          localStorage.setItem(progressKey, JSON.stringify(remoteProg));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsReady, user?.uid, storyId]);

  // ===== Redirect to last chapter when missing chapterId =====
  useEffect(() => {
    if (!storyId) return;
    if (chapterIdParam) return;
    if (!story) return;

    const saved = safeParse<ReaderProgress>(localStorage.getItem(progressKey));
    const savedId = saved?.lastChapterId;

    const fallback = chapters?.[0]?.id ? String(chapters[0].id) : "1";
    const target = savedId ? String(savedId) : String(fallback);

    navigate(`/read/${storyId}/${String(target).trim()}`, { replace: true });
  }, [chapterIdParam, navigate, progressKey, story, storyId, chapters]);

  // ===== SAVE LAST CHAPTER =====
  useEffect(() => {
    if (!storyId) return;
    if (!chapterId) return;

    const payload: ReaderProgress = {
      lastChapterId: String(chapterId),
      updatedAt: Date.now(),
    };
    localStorage.setItem(progressKey, JSON.stringify(payload));

    if (user?.uid) {
      saveProgress(user.uid, storyId, String(chapterId)).catch(() => {});
    }
  }, [chapterId, progressKey, storyId, user?.uid]);

  // ===== FULLSCREEN BACKGROUND =====
  const isDark = theme === "dark";
  const bg = isDark ? "#020617" : "#ffffff";

  useEffect(() => {
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyMargin = document.body.style.margin;

    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    document.body.style.margin = "0";

    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.margin = prevBodyMargin;
    };
  }, [bg]);

  // ===== Scroll container + auto-hide header =====
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hideHeader, setHideHeader] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    lastY.current = el.scrollTop;
    setHideHeader(false);

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const y = el.scrollTop;
        const delta = y - lastY.current;

        if (y < 60) setHideHeader(false);
        else {
          if (delta > 12) setHideHeader(true);
          if (delta < -12) setHideHeader(false);
        }

        lastY.current = y;
        ticking.current = false;
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll as any);
  }, [storyId, chapterId]);

  useEffect(() => {
    if (openSettings || openToc) setHideHeader(false);
  }, [openSettings, openToc]);

  useEffect(() => {
    if (!openToc) return;
    setTocQuery("");
    requestAnimationFrame(() => {
      tocInputRef.current?.focus();
      currentChapRef.current?.scrollIntoView({ block: "center" });
    });
  }, [openToc, chapterId]);

  const content = useMemo(() => normalizeContent(chapter?.content), [chapter?.content]);

  const sortedChapters = useMemo(() => {
    const list = chapters ?? [];
    return [...list].sort((a, b) => Number(a.id) - Number(b.id));
  }, [chapters]);

  const filteredChapters = useMemo(() => {
    const q = tocQuery.trim().toLowerCase();
    if (!q) return sortedChapters;
    return sortedChapters.filter((c) =>
      `${c.id} ${c.title ?? ""}`.toLowerCase().includes(q)
    );
  }, [sortedChapters, tocQuery]);

  const currentIndex = useMemo(() => {
    return sortedChapters.findIndex((c) => String(c.id) === String(chapterId));
  }, [sortedChapters, chapterId]);

  const prevChapterId = currentIndex > 0 ? String(sortedChapters[currentIndex - 1].id) : null;
  const nextChapterId =
    currentIndex >= 0 && currentIndex < sortedChapters.length - 1
      ? String(sortedChapters[currentIndex + 1].id)
      : null;

  const goToChapter = (cid: string) => {
    setOpenToc(false);
    navigate(`/read/${storyId}/${String(cid).trim()}`);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && prevChapterId) {
        e.preventDefault();
        goToChapter(prevChapterId);
      }
      if (e.key === "ArrowRight" && nextChapterId) {
        e.preventDefault();
        goToChapter(nextChapterId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevChapterId, nextChapterId]);

  if (dbLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white text-slate-900">
        Đang tải dữ liệu…
      </div>
    );
  }

  if (!story) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white text-slate-900">
        Không tìm thấy truyện
      </div>
    );
  }

  const textMain = isDark ? "text-slate-100" : "text-slate-900";
  const textSub = isDark ? "text-slate-400" : "text-slate-600";
  const headerBg = isDark ? "bg-slate-950" : "bg-white";
  const panelBg = isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";
  const inputBg = isDark
    ? "bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-slate-600"
    : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300";
  const btnBase = isDark
    ? "border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-100"
    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-900";

  const quoteOuterCls = isDark
    ? "border-slate-500 bg-slate-950/80 text-slate-100"
    : "border-slate-400 bg-slate-50 text-slate-900";
  const quoteInnerLineCls = isDark ? "border-slate-700/80" : "border-slate-200";

  const statBoxCls = isDark ? "border-slate-600 bg-slate-900" : "border-slate-300 bg-white";
  const statTextCls = isDark ? "text-slate-100" : "text-slate-900";
  const statSubCls = isDark ? "text-slate-400" : "text-slate-600";

  const fontOptions: { value: ReaderFont; label: string }[] = [
    { value: "sans", label: "Arial" },
    { value: "noto", label: "Noto Sans" },
    { value: "inter", label: "Inter" },
    { value: "roboto", label: "Roboto" },
    { value: "opensans", label: "Open Sans" },
    { value: "lato", label: "Lato" },
    { value: "poppins", label: "Poppins" },
  ];

  return (
    <div className="fixed inset-0 z-[999]">
      <div ref={scrollRef} className="h-full w-full overflow-y-auto" style={{ backgroundColor: bg }}>
        {/* HEADER */}
        <header
          className={[
            "sticky top-0 z-30 transition-transform duration-200",
            hideHeader ? "-translate-y-full" : "translate-y-0",
            headerBg,
            textMain,
            "border-b",
            isDark ? "border-slate-800" : "border-slate-200",
          ].join(" ")}
        >
          <div className="px-3 sm:px-10 py-3 sm:py-4">
            <div className="mx-auto max-w-6xl">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <div className="justify-self-start">
                  <Link to="/" className={`rounded-xl border px-3 sm:px-5 py-2 text-sm font-medium ${btnBase}`}>
                    <span className="sm:hidden">Home</span>
                    <span className="hidden sm:inline">Trang chủ</span>
                  </Link>
                </div>

                <div className="justify-self-center w-fit text-center">
                  <div className="truncate max-w-[52vw] text-[15px] sm:text-base font-semibold tracking-wide leading-6">
                    {story.title}
                  </div>
                </div>

                <div className="justify-self-end">
                  <div className="relative flex items-center gap-2">
                    {!authLoading && !user && (
                      <button
                        onClick={login}
                        className={`rounded-xl border px-3 sm:px-5 py-2 text-sm font-medium ${btnBase}`}
                        title="Đăng nhập để đồng bộ giữa thiết bị"
                      >
                        Đăng nhập
                      </button>
                    )}
                    {!authLoading && user && (
                      <button
                        onClick={logout}
                        className={`rounded-xl border px-3 sm:px-5 py-2 text-sm font-medium ${btnBase}`}
                        title={user.email ?? "Đã đăng nhập"}
                      >
                        Đăng xuất
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setOpenSettings((v) => !v);
                        setOpenToc(false);
                      }}
                      className={`rounded-xl border px-3 sm:px-5 py-2 text-sm font-medium ${btnBase}`}
                    >
                      Cài đặt
                    </button>

                    <button
                      onClick={() => {
                        setOpenToc((v) => !v);
                        setOpenSettings(false);
                      }}
                      className={`rounded-xl border px-3 sm:px-5 py-2 text-sm font-medium ${btnBase}`}
                    >
                      Mục lục
                    </button>

                    {(openSettings || openToc) && (
                      <button
                        aria-label="Close overlay"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => {
                          setOpenSettings(false);
                          setOpenToc(false);
                        }}
                      />
                    )}

                    {/* SETTINGS PANEL */}
                    {openSettings && (
                      <div
                        className={`fixed left-3 right-3 top-[72px] z-50 max-h-[80vh] overflow-auto rounded-3xl border p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[320px] ${panelBg}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={`text-sm font-bold ${textMain}`}>Cài đặt đọc</div>

                        <div className="mt-4">
                          <div className={`text-xs font-semibold ${textSub}`}>Giao diện</div>
                          <div className="mt-2 flex gap-2">
                            {(["light", "dark"] as ReaderTheme[]).map((t) => {
                              const active = theme === t;
                              return (
                                <button
                                  key={t}
                                  onClick={() => setTheme(t)}
                                  className={[
                                    "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                                    active ? "border-emerald-400 bg-emerald-500 text-white" : btnBase,
                                  ].join(" ")}
                                >
                                  {t === "light" ? "Light" : "Dark"}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className={`text-xs font-semibold ${textSub}`}>Font chữ</div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {fontOptions.map(({ value, label }) => {
                              const active = font === value;
                              return (
                                <button
                                  key={value}
                                  onClick={() => setFont(value)}
                                  className={[
                                    "rounded-2xl border px-2 py-2 text-xs font-semibold transition",
                                    active ? "border-emerald-400 bg-emerald-500 text-white" : btnBase,
                                  ].join(" ")}
                                  style={{ fontFamily: fontFamilyOf(value) }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className={`text-xs font-semibold ${textSub}`}>Cỡ chữ</div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => setFontSize((s) => clamp(s - 1, 14, 26))}
                              className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${btnBase}`}
                            >
                              A-
                            </button>
                            <div className={`w-12 text-center text-sm font-semibold ${textMain}`}>
                              {fontSize}
                            </div>
                            <button
                              onClick={() => setFontSize((s) => clamp(s + 1, 14, 26))}
                              className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${btnBase}`}
                            >
                              A+
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TOC PANEL */}
                    {openToc && (
                      <div
                        className={`fixed left-3 right-3 top-[72px] z-50 max-h-[80vh] overflow-auto rounded-3xl border p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[340px] ${panelBg}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-bold ${textMain}`}>Mục lục</div>
                          <button
                            onClick={() => setOpenToc(false)}
                            className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${btnBase}`}
                            aria-label="Close toc"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="mt-3">
                          <input
                            ref={tocInputRef}
                            value={tocQuery}
                            onChange={(e) => setTocQuery(e.target.value)}
                            placeholder="Tìm chapter…"
                            className={`w-full rounded-2xl border px-4 py-3 outline-none ${inputBg}`}
                          />
                        </div>

                        <div className="mt-3 max-h-[52vh] overflow-auto space-y-2 pr-1">
                          {filteredChapters.map((c) => {
                            const active = String(c.id) === String(chapterId);
                            return (
                              <button
                                key={c.id}
                                ref={active ? currentChapRef : undefined}
                                onClick={() => goToChapter(String(c.id))}
                                className={[
                                  "w-full rounded-2xl px-4 py-3 text-left border transition",
                                  active
                                    ? "bg-emerald-500 border-emerald-300 text-white"
                                    : isDark
                                    ? "bg-slate-950 border-slate-700 hover:bg-slate-800 text-slate-100"
                                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-900",
                                ].join(" ")}
                              >
                                <div className="font-bold text-sm">Chương {c.id}</div>
                                <div className={active ? "text-sm text-white/90" : `text-sm ${textSub}`}>
                                  {c.title || `Chapter ${c.id}`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-center">
                <div className="truncate mx-auto max-w-[52vw] text-base font-medium leading-6">
                  {chapter?.title ?? `Chapter ${chapterId}`}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-10 pt-4 sm:pt-6 pb-16 sm:pb-10">
          {chapterLoading ? (
            <div className={isDark ? "text-slate-200" : "text-slate-700"}>Đang tải chương…</div>
          ) : !chapter ? (
            <div className={isDark ? "text-slate-200" : "text-slate-700"}>
              Không có nội dung chương này. Vào Admin để import chương.
            </div>
          ) : (
            <article
              style={{
                fontSize,
                lineHeight: 1.9,
                fontFamily: fontFamilyOf(font),
                fontWeight: 400,
              }}
              className={isDark ? "text-slate-100" : "text-slate-800"}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="my-3 whitespace-pre-wrap">{children}</p>,

                  blockquote: ({ children }) => {
                    const raw = extractText(children);
                    const lines = String(raw)
                      .replace(/\r\n/g, "\n")
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean);

                    return (
                      <div className={["my-5 rounded-2xl border-2 px-4 py-3 shadow-md", quoteOuterCls].join(" ")}>
                        <div className="space-y-3">
                          {lines.map((line, idx) => {
                            const stats = splitStats(line);

                            if (stats.length >= 3) {
                              return (
                                <div key={idx} className={["rounded-xl border px-3 py-2", statBoxCls].join(" ")}>
                                  <div className={["mb-2 text-xs font-semibold", statSubCls].join(" ")}>
                                    Chỉ số
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                    {stats.map((s, i) => (
                                      <div key={i} className={["truncate", statTextCls].join(" ")} title={s}>
                                        {s}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={idx}
                                className={["pb-2 last:pb-0 border-b last:border-b-0", quoteInnerLineCls].join(" ")}
                              >
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  },

                  ul: ({ children }) => <ul className="my-3 list-disc pl-6">{children}</ul>,
                  ol: ({ children }) => <ol className="my-3 list-decimal pl-6">{children}</ol>,
                  li: ({ children }) => <li className="my-1">{children}</li>,
                }}
              >
                {content || ""}
              </ReactMarkdown>
            </article>
          )}

          <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:flex sm:items-center sm:justify-center sm:gap-6">
            <button
              disabled={!prevChapterId}
              onClick={() => prevChapterId && goToChapter(prevChapterId)}
              className={[
                "w-full sm:w-auto h-12 rounded-2xl border px-6 py-3 text-sm font-semibold transition",
                !prevChapterId ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-[1px]",
                btnBase,
              ].join(" ")}
            >
              ← Chương trước
            </button>

            <button
              disabled={!nextChapterId}
              onClick={() => nextChapterId && goToChapter(nextChapterId)}
              className={[
                "w-full sm:w-auto h-12 rounded-2xl border px-6 py-3 text-sm font-semibold transition",
                !nextChapterId ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-[1px]",
                btnBase,
              ].join(" ")}
            >
              Chương sau →
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
