import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { MiniApp } from "./pages/MiniApp";
import { useEffect, useState } from "react";

function DevNavigation() {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isApp = location.pathname.startsWith("/app");

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-black/60 dark:bg-white/10 backdrop-blur-xl p-1.5 rounded-full border border-white/10 flex gap-1 shadow-2xl items-center pb-safe text-white">
      <Link 
        to="/" 
        className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isLanding ? "bg-white text-black shadow-md" : "text-gray-400 hover:text-white"}`}
      >
        Landing
      </Link>
      <Link 
        to="/app" 
        className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isApp ? "bg-[#533afd] text-white shadow-md shadow-[#533afd]/20" : "text-gray-400 hover:text-white"}`}
      >
        Mini App
      </Link>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'light'|'dark'>('light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/app/*" element={<MiniApp theme={theme} toggleTheme={toggleTheme} />} />
      </Routes>
      <DevNavigation />
    </BrowserRouter>
  );
}
