import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

export default function Shell() {
  const location = useLocation();
  const hideHeader = location.pathname.startsWith("/read");

  return (
    // ✅ đổi nền toàn app sang trắng (không còn khung xám)
    <div className="min-h-screen bg-white">
      {!hideHeader && (
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex h-14 items-center justify-between">
              <Link
                to="/"
                className="text-lg font-extrabold tracking-tight text-slate-900"
              >
                Overgeared
              </Link>

              <nav className="flex items-center gap-2 text-sm">
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    [
                      "rounded-lg px-3 py-1.5 font-semibold transition",
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")
                  }
                >
                  Admin
                </NavLink>
              </nav>
            </div>
          </div>
        </header>
      )}

      {/* ✅ main vẫn giữ max-width nhưng nền trắng nên không còn cảm giác “viền” */}
      <main className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
