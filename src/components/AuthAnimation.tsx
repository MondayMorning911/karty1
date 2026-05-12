import React, { useState, useEffect } from 'react';

export const KartyLogo = ({ className = "w-12 h-12", theme = "default" }: { className?: string, theme?: string }) => {
  const isKorter = theme === "korter";
  // Use inline styles for dynamic colors to ensure they don't get purged by Tailwind
  const stemColor = isKorter ? "#2B3C5A" : "#1A2942";
  const armColor = isKorter ? "#F05A28" : "#4B3BFF";
  
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Left Stem */}
      <rect x="23" y="23" width="18" height="54" rx="4" fill={stemColor} className="dark:fill-slate-200" />
      {/* Top Right Arm */}
      <path d="M41 53 L62 26 C64 23 68 24 68 27 L68 35 L48 60 Z" fill={armColor} />
      {/* Bottom Right / House */}
      <path d="M44 63 L51 55 H64 C66 55 68 57 68 59 V73 C68 75 66 77 64 77 H48 C45 77 44 75 44 73 Z" fill={armColor} />
      {/* Windows */}
      <rect x="52" y="60" width="6" height="6" rx="1.5" fill="#FFFFFF" className={isKorter ? "dark:fill-[#0A162B]" : ""} />
      <rect x="52" y="69" width="6" height="6" rx="1.5" fill="#FFFFFF" className={isKorter ? "dark:fill-[#0A162B]" : ""} />
    </svg>
  );
};

export const AuthAnimation = ({ theme = "default" }: { theme?: string }) => {
  const isKorter = theme === "korter";
  const glowColor = isKorter ? "rgba(240, 90, 40, 0.2)" : "rgba(75, 59, 255, 0.2)";
  const ringPrimary = isKorter ? "border-[#F05A28]" : "border-[#4B3BFF]";
  const textColor = isKorter ? "text-[#F05A28]" : "text-[#4B3BFF]";
  
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10 opacity-0 animate-[fadeIn_0.5s_ease-out_forwards] w-full relative">
      <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
        
        {/* Orbit Rings representing networking/connections */}
        <div className={`absolute inset-0 rounded-full border border-slate-200 dark:border-slate-700 opacity-50`}></div>
        <div className={`absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-[#F05A28] border-r-[#F05A28] ${isKorter ? 'border-t-[#F05A28] border-r-[#F05A28]' : 'border-t-[#4B3BFF] border-r-[#4B3BFF]'} opacity-70 animate-[spin_3s_linear_infinite]`}></div>
        <div className={`absolute inset-3 rounded-full border-[1.5px] border-transparent border-b-[#F05A28] border-l-[#F05A28] ${isKorter ? 'border-b-[#F05A28] border-l-[#F05A28]' : 'border-b-[#4B3BFF] border-l-[#4B3BFF]'} opacity-40 animate-[spin_4s_linear_infinite_reverse]`}></div>

        {/* Soft Pulse Background */}
        <div 
          className="absolute inset-5 rounded-full blur-2xl animate-pulse"
          style={{ backgroundColor: glowColor, animationDuration: '2s' }}
        ></div>

        {/* Central Logo Container */}
        <div className="relative z-10 w-16 h-16 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg border border-slate-100 dark:border-slate-800 animate-float">
           <KartyLogo className="w-10 h-10 drop-shadow-sm" theme={theme} />
           
           {/* Check/Radar dot */}
           <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border-2 ${ringPrimary}`}>
             <div className={`w-full h-full rounded-full ${isKorter ? 'bg-[#F05A28]' : 'bg-[#4B3BFF]'} animate-[ping_2s_ease-in-out_infinite] opacity-60`}></div>
           </div>
        </div>

        {/* Outer Connection Nodes */}
        <div className="absolute w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 top-2 left-6"></div>
        <div className="absolute w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500 bottom-4 right-5"></div>
      </div>

      <div className="space-y-3 text-center z-10 flex flex-col items-center">
        <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1 flex items-center justify-center">
          Установка защищенного соединения<span className={`inline-block w-4 text-left ${textColor}`}>{dots}</span>
        </h3>
        
        <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
          МЫ ПОЧТИ У ЦЕЛИ. ОЖИДАНИЕ 15–40 СЕКУНД
        </p>
        
        <div className="mt-5 w-40 h-[3px] bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
          <div className={`absolute top-0 bottom-0 left-0 w-1/2 rounded-full ${isKorter ? 'bg-[#F05A28]' : 'bg-[#4B3BFF]'} animate-scan`}></div>
        </div>
      </div>
    </div>
  );
};
