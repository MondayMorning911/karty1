import React from 'react';

export const KartyLogo = ({ className = "w-12 h-12", theme = "default" }: { className?: string, theme?: string }) => {
  const isKorter = theme === "korter";
  // Use inline styles for dynamic colors to ensure they don't get purged by Tailwind
  const stemColor = isKorter ? "#061b31" : "#0A1D36";
  const armColor = isKorter ? "#F05A28" : "#4B3BFF";
  
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Left Stem */}
      <rect x="23" y="23" width="18" height="54" rx="4" fill={stemColor} />
      {/* Top Right Arm */}
      <path d="M41 53 L62 26 C64 23 68 24 68 27 L68 35 L48 60 Z" fill={armColor} />
      {/* Bottom Right / House */}
      <path d="M44 63 L51 55 H64 C66 55 68 57 68 59 V73 C68 75 66 77 64 77 H48 C45 77 44 75 44 73 Z" fill={armColor} />
      {/* Windows */}
      <rect x="52" y="60" width="6" height="6" rx="1.5" fill="#FFFFFF" />
      <rect x="52" y="69" width="6" height="6" rx="1.5" fill="#FFFFFF" />
    </svg>
  );
};

export const AuthAnimation = ({ theme = "default" }: { theme?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center py-8 opacity-100 overflow-hidden w-full relative h-[250px]">
      <div className="relative w-full h-32 mb-6 flex items-center justify-center">
        {/* Sky / Clouds */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          <div className="text-3xl absolute top-[10%] -left-8 animate-[slideRight_12s_linear_infinite]">☁️</div>
          <div className="text-4xl absolute top-[40%] -left-16 animate-[slideRight_16s_linear_infinite_2s]">☁️</div>
          <div className="text-2xl absolute top-[70%] -left-10 animate-[slideRight_20s_linear_infinite_5s]">☁️</div>
        </div>

        {/* Keys moving towards the house */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="text-2xl absolute -right-10 top-[40%] animate-[slideLeft_4s_linear_infinite]">
            <div className="animate-[spin_4s_linear_infinite]">🔑</div>
          </div>
          <div className="text-2xl absolute -right-10 top-[60%] animate-[slideLeft_5s_linear_infinite_2s]">
            <div className="animate-[spin_3s_linear_infinite]">🗝️</div>
          </div>
        </div>

        {/* Bouncing Logo */}
        <div className="absolute z-10 w-20 h-20 bg-white dark:bg-white/10 rounded-2xl flex items-center justify-center shadow-xl border border-slate-100 dark:border-white/5 animate-[bounce_1.5s_infinite]">
           <KartyLogo className="w-16 h-16 drop-shadow-sm" theme={theme} />
        </div>
      </div>
      <h3 className="text-base font-bold text-slate-800 dark:text-white text-center mb-2 z-10 animate-pulse">
        Связываемся с площадкой...
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center px-4 leading-relaxed max-w-[280px] z-10">
        Авторизация занимает от 15 до 40 секунд.<br/>Мы почти у цели 🪄
      </p>
    </div>
  );
};
