import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Only handle root path, let Vite proxy handle other paths */}
        <Route path="/" element={<HomePage />} />
        {/* All other paths (/Banner_gen, /FluidDAM, /link, etc.) are handled by Vite proxy */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;


