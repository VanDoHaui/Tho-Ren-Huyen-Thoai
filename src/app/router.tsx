import { createBrowserRouter } from "react-router-dom";
import Shell from "../components/Shell";
import Home from "../pages/Home";
import Reader from "../pages/Reader";
import Admin from "../pages/Admin";

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },

      // ✅ thêm route này
      { path: "/read/:storyId", element: <Reader /> },

      // đọc chapter cụ thể
      { path: "/read/:storyId/:chapterId", element: <Reader /> },

      { path: "/admin", element: <Admin /> },
    ],
  },
]);
