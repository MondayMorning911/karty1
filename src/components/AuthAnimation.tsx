import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Home, KeyRound, Cloud } from 'lucide-react';

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
  const primaryColor = isKorter ? "#F05A28" : "#4B3BFF";
  const softColor = isKorter ? "rgba(240, 90, 40, 0.15)" : "rgba(75, 59, 255, 0.15)";
  
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10 w-full relative min-h-[300px] overflow-hidden">
      
      {/* Interactive/Animated Scene */}
      <div className="relative w-full h-40 flex flex-col items-center justify-center mb-8">
        
        {/* Background Clouds */}
        <motion.div 
          animate={{ x: [-20, 20], y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          className="absolute top-0 left-[10%] text-slate-300 dark:text-slate-700 opacity-60"
        >
          <Cloud size={40} />
        </motion.div>
        
        <motion.div 
          animate={{ x: [20, -20], y: [0, 5, 0] }}
          transition={{ duration: 5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          className="absolute top-6 right-[10%] text-slate-300 dark:text-slate-700 opacity-50"
        >
          <Cloud size={32} />
        </motion.div>

        {/* Small floating keys and houses */}
        <motion.div
           animate={{ y: [0, -15, 0], rotate: [0, -10, 0] }}
           transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
           className="absolute left-[20%] bottom-[10%]"
        >
           <Home size={24} color={primaryColor} className="opacity-40" />
        </motion.div>
        
        <motion.div
           animate={{ y: [0, -20, 0], rotate: [0, 15, 0] }}
           transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
           className="absolute right-[20%] bottom-[20%]"
        >
           <KeyRound size={20} color={primaryColor} className="opacity-40" />
        </motion.div>

        {/* Main Logo Container */}
        <motion.div
          animate={{ y: [-5, 5] }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          className="relative z-10 w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center shadow-lg border border-slate-100 dark:border-slate-700"
        >
          {/* Pulse effect behind logo */}
          <motion.div 
            animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-3xl"
            style={{ backgroundColor: softColor }}
          />
          <KartyLogo className="w-12 h-12 relative z-10" theme={theme} />
        </motion.div>
        
        {/* Connection arc/line */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
           <motion.path
             d="M -50 100 Q 150 160 350 100"
             fill="transparent"
             stroke={softColor}
             strokeWidth="2.5"
             strokeDasharray="8,8"
             animate={{ strokeDashoffset: [0, -64] }}
             transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
           />
        </svg>

      </div>

      {/* Texts */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 text-center z-10 flex flex-col items-center px-4"
      >
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center justify-center m-0">
          Установка соединения
          <span className="inline-block w-6 text-left" style={{ color: primaryColor }}>{dots}</span>
        </h3>
        
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-[280px]">
          Авторизация занимает от 15 до 40 секунд.<br/>Мы почти у цели 🪄
        </p>
        
        {/* Progress bar simulation */}
        <div className="w-48 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0 mt-2 relative">
          <motion.div 
            className="absolute top-0 bottom-0 w-1/2 rounded-full"
            style={{ backgroundColor: primaryColor }}
            animate={{ left: ["-50%", "100%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </div>
  );
};
