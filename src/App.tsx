import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Reader from "./pages/Reader";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/admin" element={<Admin />} />

      <Route path="/read/:storyId" element={<Reader />} />
      <Route path="/read/:storyId/:chapterId" element={<Reader />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
