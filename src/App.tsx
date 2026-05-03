import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { MiniApp } from "./pages/MiniApp";
import { Crm } from "./pages/Crm";
import { useEffect, useState } from "react";

function RootRoute({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) {
  const isTelegram = window.Telegram?.WebApp?.initData !== undefined && window.Telegram?.WebApp?.initData !== '';

  if (isTelegram) {
    return <Navigate to="/app" replace />;
  }

  return <LandingPage theme={theme} toggleTheme={toggleTheme} />;
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
        <Route path="/" element={<RootRoute theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/app/*" element={<MiniApp theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/crm/*" element={<Crm />} />
      </Routes>
    </BrowserRouter>
  );
}
