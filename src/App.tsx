import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/banner-gen/*" element={<Navigate to="/banner-gen" />} />
        <Route path="/fluiddam/*" element={<Navigate to="/fluiddam" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

