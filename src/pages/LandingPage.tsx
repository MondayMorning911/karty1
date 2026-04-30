import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, CheckCircle2, Zap, Smartphone, LineChart, XCircle, Sparkles, Camera, Star, Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { translations, Language } from "../i18n";
import { KorterIcon, SSIcon, RealtingIcon, MyHomeIcon } from '../components/PlatformIcons';

const STRIPE_SHADOW = "shadow-[0_13px_27px_-5px_rgba(50,50,93,0.05),0_8px_16px_-8px_rgba(0,0,0,0.03)] dark:shadow-none";
const ELEVATE_SHADOW = "shadow-[0_30px_60px_-12px_rgba(50,50,93,0.15),0_18px_36px_-18px_rgba(0,0,0,0.1)] dark:shadow-none";

function KartyLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm">
      <rect x="25" y="20" width="16" height="60" rx="4" className="fill-[#0a2540] dark:fill-white" />
      <path d="M38 52 L 70 20 C 72 18, 76 18, 78 20 L 78 28 C 78 30, 77 32, 75 33 L 38 70 Z" fill="#533afd" />
      <path fillRule="evenodd" clipRule="evenodd" d="M48 64 L 62 50 H 76 C 79.3137 50 82 52.6863 82 56 V 76 C 82 79.3137 79.3137 82 76 82 H 54 C 50.6863 82 48 79.3137 48 76 V 64 Z M 58 58 C 58 56.8954 58.8954 56 60 56 H 64 C 65.1046 56 66 56.8954 66 58 V 62 C 66 63.1046 65.1046 64 64 64 H 60 C 58.8954 64 58 63.1046 58 62 V 58 Z M 60 68 C 58.8954 68 58 68.8954 58 70 V 74 C 58 75.1046 58.8954 76 60 76 H 64 C 65.1046 76 66 75.1046 66 74 V 70 C 66 68.8954 65.1046 68 64 68 H 60 Z" fill="#533afd" />
    </svg>
  );
}

interface PageProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function LandingPage({ theme, toggleTheme }: PageProps) {
  const [lang, setLang] = useState<Language>('ru');
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#f6f9fc] dark:bg-[#050505] text-[#425466] dark:text-gray-300 font-sans selection:bg-[#635bff]/20 selection:text-[#635bff] overflow-hidden relative transition-colors duration-500">
      
      {/* Background subtleties */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-[#ffffff] dark:from-[#0A0A0A] to-transparent pointer-events-none opacity-60 dark:opacity-100" />
      <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] bg-[#635bff]/[0.02] dark:bg-[#635bff]/[0.15] blur-[140px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <KartyLogo />
          <span className="font-bold text-[20px] sm:text-[22px] tracking-tight text-[#0a2540] dark:text-white">Karty</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="hidden md:flex items-center gap-8 text-[15px] font-medium text-[#64748d] dark:text-gray-400">
            <a href="#features" className="hover:text-[#061b31] dark:hover:text-white transition-colors">{t.nav.features}</a>
            <a href="#platforms" className="hover:text-[#061b31] dark:hover:text-white transition-colors">{t.nav.platforms}</a>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Theme Toggle */}
            <button onClick={toggleTheme} className="p-2 sm:p-2 text-[#64748d] dark:text-gray-400 hover:text-[#533afd] dark:hover:text-white bg-[#f7f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-full transition-colors flex items-center justify-center" aria-label="Toggle Theme">
              {theme === 'dark' ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
            </button>

            {/* Language Toggle */}
            <div className="flex items-center bg-[#f7f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-full p-1 text-xs font-medium uppercase tracking-wider">
            <button 
              onClick={() => setLang('ru')} 
              className={`px-3 py-1.5 rounded-full transition-all ${lang === 'ru' ? 'bg-[#533afd] text-white shadow-sm' : 'text-[#64748d] dark:text-gray-400 hover:text-[#061b31] dark:hover:text-white'}`}
            >
              RU
            </button>
            <button 
              onClick={() => setLang('en')} 
              className={`px-3 py-1.5 rounded-full transition-all ${lang === 'en' ? 'bg-[#533afd] text-white shadow-sm' : 'text-[#64748d] dark:text-gray-400 hover:text-[#061b31] dark:hover:text-white'}`}
            >
              EN
            </button>
          </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-16 pb-16 sm:pb-24">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-24">
          
          {/* Left Text */}
          <div className="flex-1 space-y-6 sm:space-y-8 relative z-20 text-center lg:text-left flex flex-col items-center lg:items-start">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f8f9fc] dark:bg-blue-500/10 border border-[#e5edf5] dark:border-blue-500/20 text-[#533afd] text-[13px] font-medium"
            >
              <Zap size={14} className="fill-[#533afd]/20" />
              <span>{t.hero.badge}</span>
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-[40px] sm:text-[52px] lg:text-[68px] font-light tracking-[-1px] sm:tracking-[-2px] text-[#0a2540] dark:text-white leading-[1.1] sm:leading-[1.05]"
            >
              {t.hero.title1} <br className="hidden sm:block" />
              {t.hero.title2}<br />
              <span className="text-[#635bff] dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-blue-400 dark:to-indigo-500">{t.hero.title3}</span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-[16px] sm:text-[18px] text-[#64748d] dark:text-gray-400 max-w-lg leading-[1.6] font-light"
            >
              {t.hero.desc}
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 pt-4 w-full sm:w-auto"
            >
              <a href="https://t.me/KartyEstate_bot" target="_blank" rel="noopener noreferrer" className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-lg font-medium ${STRIPE_SHADOW} transition-all active:scale-[0.98]`}>
                <span>{t.hero.btnTry}</span>
                <ArrowRight size={18} />
              </a>
              <a href="#features" className="w-full sm:w-auto flex items-center justify-center px-8 py-4 bg-transparent hover:bg-[#533afd]/[0.05] dark:hover:bg-white/10 text-[#533afd] dark:text-white border border-[#d6d9fc] dark:border-white/20 rounded-lg font-medium transition-all active:scale-[0.98]">
                {t.hero.btnHow}
              </a>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex items-center gap-6 pt-6 text-[14px] font-medium text-[#64748d] dark:text-gray-400"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#15be53] dark:text-emerald-500" />
                <span>{t.hero.check1}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#15be53] dark:text-emerald-500" />
                <span>{t.hero.check2}</span>
              </div>
            </motion.div>
          </div>

          {/* Right Visual (App Mockup) */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 80 }}
              className="flex-1 relative w-full max-w-[320px] sm:max-w-[400px] lg:max-w-none flex justify-center mt-8 sm:mt-12 lg:mt-0"
            >
              <div className={`relative z-10 w-full max-w-[280px] sm:max-w-[340px] rounded-[32px] border-[6px] border-[#0a2540] dark:border-[#1F1F1F] bg-[#f7f9fc] dark:bg-[#0A0A0A] ${ELEVATE_SHADOW} dark:shadow-2xl dark:shadow-blue-900/20 transition-transform duration-500 hover:-translate-y-2`}>
                <AnimatedPhoneMockup lang={lang} t={t.mockup} />
              </div>
              {/* Background glowing soft blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#635bff]/5 blur-[120px] -z-10 rounded-full" />
            </motion.div>
        </div>
      </main>

      {/* Integrations Section */}
      <section id="platforms" className="relative z-10 w-full border-y border-[#e5edf5] dark:border-white/5 bg-[#fcfdfd] dark:bg-white/[0.02] py-12 sm:py-16 mb-16 sm:mb-24 transition-colors duration-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[12px] sm:text-[13px] text-[#64748d] dark:text-gray-500 font-bold uppercase tracking-[1px] mb-8 sm:mb-10">{t.platformsSection.title}</p>
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 md:gap-20 opacity-80 dark:opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
            <h3 className="text-xl sm:text-2xl font-black text-[#061b31] dark:text-white">Korter<span className="text-[#F05A28]">.ge</span></h3>
            <h3 className="text-xl sm:text-2xl font-black text-[#061b31] dark:text-white">Realting<span className="text-blue-500">.com</span></h3>
            <h3 className="text-xl sm:text-2xl font-black text-[#061b31] dark:text-white">SS<span className="text-red-500">.ge</span></h3>
            <h3 className="text-xl sm:text-2xl font-black text-[#061b31] dark:text-white">MyHome<span className="text-yellow-500">.ge</span></h3>
          </div>
        </div>
      </section>

      {/* Pain & Solution Section */}
      <section id="solution" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          
          {/* Left: The Problem */}
          <div className="space-y-6 sm:space-y-8 order-2 lg:order-1 text-center lg:text-left">
            <div className="space-y-4">
              <h2 className="text-[28px] sm:text-[32px] md:text-[44px] tracking-[-1px] font-light text-[#061b31] dark:text-white leading-[1.15]">
                {t.solution.title1} <br className="hidden lg:block" /> <strong className="font-medium">{t.solution.title2}</strong>
              </h2>
              <p className="text-[#64748d] dark:text-gray-400 text-base sm:text-lg leading-[1.6] max-w-lg mx-auto lg:mx-0 font-light">
                {t.solution.desc}
              </p>
            </div>
            
            <div className="space-y-3 sm:space-y-4 pt-2 sm:pt-4 text-left">
              {t.solution.pains.map((pain, idx) => (
                <PainItem key={idx} text={pain} />
              ))}
            </div>
          </div>

          {/* Right: The Solution */}
          <div className="relative order-1 lg:order-2">
            <div className={`relative bg-white dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/10 rounded-[24px] p-6 sm:p-8 md:p-12 overflow-hidden ${ELEVATE_SHADOW} dark:shadow-2xl transition-colors duration-500`}>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-8 sm:mb-10 text-center sm:text-left">
                <div className="w-12 h-12 bg-[#533afd] rounded-xl flex items-center justify-center shadow-lg shadow-[#533afd]/30 shrink-0">
                  <Sparkles size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-[20px] font-medium text-[#061b31] dark:text-white tracking-[-0.3px]">{t.solution.aiTitle}</h3>
                  <p className="text-sm text-[#64748d] dark:text-gray-400">{t.solution.aiSub}</p>
                </div>
              </div>

              <div className="space-y-6 relative">
                {/* Fake AI parsing process */}
                <div className="bg-[#f8f9fc] dark:bg-[#0A0A0A] rounded-xl border border-[#e5edf5] dark:border-white/5 p-5 relative overflow-hidden transition-colors">
                  <p className="text-[#273951] dark:text-gray-300 text-[15px] font-normal leading-relaxed">"{t.solution.aiQuote}"</p>
                </div>

                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-[#e5edf5] dark:from-white/10 to-[#533afd]/50" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {t.solution.aiTypes.map((type, idx) => (
                    <div key={idx} className="bg-white dark:bg-blue-500/5 border border-[#e5edf5] dark:border-blue-500/20 shadow-sm dark:shadow-none rounded-xl p-4 flex justify-between items-center transition-all hover:border-[#533afd]/30 dark:hover:bg-blue-500/10">
                      <span className="text-[12px] font-medium text-[#64748d] dark:text-blue-300/80">{type}</span>
                      <span className="text-[14px] font-medium text-[#061b31] dark:text-white">{t.solution.aiVals[idx]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section id="features" className="relative z-10 w-full bg-[#f8f9fc] dark:bg-black/50 border-t border-[#e5edf5] dark:border-white/5 py-20 sm:py-32 transition-colors duration-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-20 max-w-2xl mx-auto">
            <h2 className="text-[28px] sm:text-[32px] md:text-[44px] font-light tracking-[-1px] text-[#061b31] dark:text-white mb-4">{t.features.title}</h2>
            <p className="text-[#64748d] dark:text-gray-400 text-base sm:text-lg font-light">{t.features.desc}</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            <FeatureCard 
              icon={<Smartphone size={24} className="text-[#533afd]" />}
              title={t.features.cards[0].t}
              desc={t.features.cards[0].d}
            />
            <FeatureCard 
              icon={<Zap size={24} className="text-[#533afd]" />}
              title={t.features.cards[1].t}
              desc={t.features.cards[1].d}
            />
            <FeatureCard 
              icon={<LineChart size={24} className="text-[#533afd]" />}
              title={t.features.cards[2].t}
              desc={t.features.cards[2].d}
            />
          </div>
        </div>
      </section>

      {/* Before / After Section */}
      <section className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-32">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-[28px] sm:text-[32px] md:text-[44px] font-light tracking-[-1px] text-[#061b31] dark:text-white mb-4">{t.beforeAfter.title}</h2>
        </div>

        <div className={`bg-white dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 rounded-[24px] overflow-hidden ${STRIPE_SHADOW} transition-colors duration-500`}>
          {/* Header Row */}
          <div className="hidden sm:grid sm:grid-cols-2 bg-[#f8f9fc] dark:bg-[#0A0A0A] border-b border-[#e5edf5] dark:border-white/5 p-6 md:p-8 transition-colors">
            <div className="text-center md:text-left text-[#64748d] dark:text-gray-400 font-medium text-lg md:text-xl">{t.beforeAfter.beforeTitle}</div>
            <div className="text-center md:text-left text-[#533afd] dark:text-blue-400 font-medium text-lg md:text-xl flex items-center justify-center md:justify-start gap-2">
              {t.beforeAfter.afterTitle} <RocketIcon />
            </div>
          </div>
          
          {/* Items */}
          <div className="flex flex-col sm:block divide-y divide-[#e5edf5] dark:divide-white/5 disabled-divide-y-on-mobile">
            {t.beforeAfter.items.map((item, idx) => (
              <div key={idx} className="flex flex-col sm:grid sm:grid-cols-2 p-5 sm:p-6 md:p-8 gap-5 sm:gap-0 transition-colors hover:bg-[#f8f9fc]/50 dark:hover:bg-white/[0.02] border-b border-[#e5edf5] dark:border-white/5 sm:border-b-0">
                <div className="sm:pr-4 md:pr-8 flex flex-col gap-2 relative">
                   <div className="sm:hidden text-[11px] font-bold uppercase tracking-wider text-[#64748d] dark:text-gray-500">{t.beforeAfter.beforeTitle}</div>
                   <div className="flex items-start gap-3">
                     <XCircle className="text-[#ff4264] dark:text-red-400 shrink-0 mt-0.5" size={20} strokeWidth={2} />
                     <p className="text-[14px] md:text-[15px] font-medium text-[#64748d] dark:text-gray-400 opacity-90">{item.before}</p>
                   </div>
                </div>
                <div className="sm:pl-4 md:pl-8 sm:border-l border-[#e5edf5] dark:border-white/5 flex flex-col gap-2 pt-2 sm:pt-0 border-t sm:border-t-0">
                   <div className="sm:hidden text-[11px] font-bold uppercase tracking-wider text-[#533afd] dark:text-blue-400">{t.beforeAfter.afterTitle}</div>
                   <div className="flex items-start gap-3">
                     <CheckCircle2 className="text-[#15be53] dark:text-emerald-400 shrink-0 mt-0.5" size={20} strokeWidth={2} />
                     <p className="text-[14px] md:text-[15px] font-medium text-[#061b31] dark:text-white">{item.after}</p>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="relative z-10 w-full bg-[#061b31] dark:bg-[#0A0A0A] py-16 sm:py-24 overflow-hidden border-t border-transparent dark:border-white/10 transition-colors duration-500">
        <div className="absolute inset-0 bg-[#533afd]/10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <h2 className="text-[32px] sm:text-[40px] md:text-[56px] font-light tracking-[-1.5px] text-white mb-6 sm:mb-8">{t.cta.title}</h2>
          <a href="https://t.me/KartyEstate_bot" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-lg font-medium shadow-xl transition-transform active:scale-95">
            <span>{t.cta.btn}</span>
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* Main Legal Footer */}
      <footer className="relative z-10 w-full border-t border-[#e5edf5] dark:border-white/5 bg-[#fcfdfd] dark:bg-[#050505] py-8 transition-colors duration-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 opacity-80">
            <KartyLogo />
            <span className="font-bold text-[18px] tracking-tight text-[#0a2540] dark:text-white">Karty</span>
          </div>
          <p className="text-[12px] text-[#64748d] dark:text-gray-500 max-w-2xl leading-relaxed text-center md:text-right font-medium">
            {t.footerDisclaimer}
          </p>
        </div>
      </footer>
    </div>
  );
}

function RocketIcon() {
  return <span className="text-[18px]">🚀</span>;
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className={`bg-white dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 transition-all hover:dark:border-white/10 p-8 rounded-[24px] ${ELEVATE_SHADOW}`}>
      <div className="w-14 h-14 bg-[#f8f9fc] dark:bg-white/5 rounded-xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-[20px] font-medium tracking-[-0.3px] text-[#061b31] dark:text-white mb-3">{title}</h3>
      <p className="text-[15px] text-[#64748d] dark:text-gray-400 leading-[1.6]">{desc}</p>
    </div>
  );
}

function PainItem({ text }: { text: string; key?: React.Key }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#e5edf5] dark:border-white/5 shadow-sm dark:shadow-none transition-colors">
      <div className="mt-0.5 shrink-0">
        <XCircle size={18} className="text-[#ff4264] dark:text-red-400" />
      </div>
      <span className="text-[15px] text-[#273951] dark:text-gray-300 leading-snug font-medium">{text}</span>
    </div>
  );
}

function AnimatedPhoneMockup({ lang, t }: { lang: Language, t: any }) {
  const [phase, setPhase] = useState(0);
  const [text, setText] = useState("");
  
  useEffect(() => {
    let mounted = true;
    const rawText = t.rawText;
    const enhancedText = t.enhancedText;
    
    const runCycle = async () => {
      while (mounted) {
        setPhase(0);
        setText("");
        await new Promise(r => setTimeout(r, 1000));
        if (!mounted) break;
        
        setPhase(1);
        for (let i = 0; i <= rawText.length; i+=2) { 
          if (!mounted) break;
          setText(rawText.slice(0, i));
          await new Promise(r => setTimeout(r, Math.random() * 20 + (lang === 'en' ? 15 : 25)));
        }
        await new Promise(r => setTimeout(r, 600));

        if (!mounted) break;
        setPhase(1.5); 
        await new Promise(r => setTimeout(r, 1200));

        if (!mounted) break;
        setPhase(2); 
        setText("");
        for (let i = 0; i <= enhancedText.length; i+=3) { 
          if (!mounted) break;
          setText(enhancedText.slice(0, i));
          await new Promise(r => setTimeout(r, Math.random() * 10 + 5)); 
        }
        await new Promise(r => setTimeout(r, 1500));
        
        if (!mounted) break;
        setPhase(3); 
        await new Promise(r => setTimeout(r, 1200));
        
        if (!mounted) break;
        setPhase(4); 
        await new Promise(r => setTimeout(r, 1200));
        
        if (!mounted) break;
        setPhase(5); 
        await new Promise(r => setTimeout(r, 1500));
        
        if (!mounted) break;
        setPhase(6); 
        await new Promise(r => setTimeout(r, 4000));
      }
    };
    runCycle();
    return () => { mounted = false; };
  }, [lang, t.rawText, t.enhancedText]);

  const photos = [
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=80"
  ];

  return (
    <div className="relative w-full aspect-[1/2.2] sm:aspect-[9/19] rounded-[26px] bg-white dark:bg-[#0A0A0A] overflow-hidden flex flex-col transition-colors duration-500 pointer-events-none select-none">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-50"></div>

      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-12 pb-4 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#e5edf5] dark:border-white/10 z-10 relative transition-colors">
        <h1 className="text-[18px] font-medium tracking-tight text-[#061b31] dark:text-white/90">{t.newListing}</h1>
        <div className="flex items-center gap-1.5 opacity-60">
          <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="20" width="16" height="60" rx="4" className="fill-[#0a2540] dark:fill-white" />
            <path d="M38 52 L 70 20 C 72 18, 76 18, 78 20 L 78 28 C 78 30, 77 32, 75 33 L 38 70 Z" fill="#533afd" />
            <path fillRule="evenodd" clipRule="evenodd" d="M48 64 L 62 50 H 76 C 79.3137 50 82 52.6863 82 56 V 76 C 82 79.3137 79.3137 82 76 82 H 54 C 50.6863 82 48 79.3137 48 76 V 64 Z M 58 58 C 58 56.8954 58.8954 56 60 56 H 64 C 65.1046 56 66 56.8954 66 58 V 62 C 66 63.1046 65.1046 64 64 64 H 60 C 58.8954 64 58 63.1046 58 62 V 58 Z M 60 68 C 58.8954 68 58 68.8954 58 70 V 74 C 58 75.1046 58.8954 76 60 76 H 64 C 65.1046 76 66 75.1046 66 74 V 70 C 66 68.8954 65.1046 68 64 68 H 60 Z" fill="#533afd" />
          </svg>
          <span className="text-[12px] font-bold text-[#0a2540] dark:text-white tracking-tight">Karty</span>
        </div>
      </div>
      
      <div className="flex-1 px-4 space-y-2.5 overflow-y-auto pb-32 no-scrollbar relative bg-[#fcfdfd] dark:bg-[#0A0A0A] pt-3 transition-colors">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[60px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[80px] rounded-full pointer-events-none" />
        
        {/* Textarea */}
        <div className="relative z-10 bg-white dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-2xl p-3 flex flex-col transition-all shadow-sm dark:shadow-none">
          <AnimatePresence>
            {phase >= 2 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                className="flex gap-1.5 mb-1.5 overflow-hidden"
              >
                <span className="bg-[#533afd] px-2 py-0.5 rounded shadow-sm text-[9px] font-medium text-white">{t.styleSelling}</span>
                <span className="bg-[#f8f9fc] dark:bg-white/5 border border-[#e5edf5] dark:border-white/5 text-[#64748d] dark:text-gray-400 px-2 py-0.5 rounded text-[9px] font-medium">{t.stylePro}</span>
                <span className="bg-[#f8f9fc] dark:bg-white/5 border border-[#e5edf5] dark:border-white/5 text-[#64748d] dark:text-gray-400 px-2 py-0.5 rounded text-[9px] font-medium">{t.styleShort}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative w-full text-[12px] text-[#273951] dark:text-gray-200 leading-[1.6] font-sans min-h-[60px] max-h-[100px] overflow-y-auto whitespace-pre-wrap no-scrollbar">
            {text === "" && <span className="absolute text-[#a0aabf] dark:text-gray-600 pointer-events-none">{t.placeholder}</span>}
            {text}
            {phase === 1 && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-1.5 h-3.5 bg-[#533afd] ml-0.5 align-middle" />}
          </div>

          <AnimatePresence>
            {phase === 1.5 && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute bottom-8 right-3 bg-[#533afd] text-white shadow-lg shadow-[#533afd]/30 font-medium text-[10px] px-3 py-1.5 rounded-full flex items-center gap-1.5 z-20"
              >
                <Sparkles size={12} className="text-white/80" />
                {t.aiEnhance}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-between items-center mt-3 border-t border-[#e5edf5] dark:border-white/5 pt-2 transition-colors">
            <div className="text-[10px] text-[#64748d] dark:text-gray-500 font-medium">
              {t.detected} <span className="text-[#533afd] dark:text-blue-400">{phase >= 2 ? t.params4 : t.params0}</span>
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-wider text-[#64748d] dark:text-gray-500 font-medium">{t.photos}</h3>
          <div className="flex gap-2 relative z-10">
            <div className="shrink-0 w-16 h-16 rounded-xl bg-white dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/10 border-dashed flex flex-col items-center justify-center gap-1 text-[#a0aabf] dark:text-gray-500 transition-colors">
              <Camera size={18} strokeWidth={1.5} />
            </div>
            <AnimatePresence>
              {phase >= 3 && photos.map((p, i) => (
                <motion.div 
                  key={p}
                  initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ delay: i * 0.15, duration: 0.4 }}
                  className={`relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border transition-colors ${i === 0 ? "border-[#533afd]" : "border-[#e5edf5] dark:border-white/10"}`}
                >
                  <img src={p} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <div className="absolute top-1 left-1 bg-[#533afd] rounded p-0.5 shadow-sm">
                      <Star size={8} className="fill-white text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Platforms */}
        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-wider text-[#64748d] dark:text-gray-500 font-medium">{t.platforms}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <MockPlatformSwitch active={phase >= 4} name="Korter" logo={<KorterIcon className="w-3 h-3" />} color="text-[#061b31] dark:text-white" bg="bg-gray-100 dark:bg-white/5" />
            <MockPlatformSwitch active={false} name="Realting" logo={<RealtingIcon className="w-3 h-3" />} color="text-[#061b31] dark:text-white" bg="bg-gray-100 dark:bg-white/5" />
            <MockPlatformSwitch active={phase >= 4} delay={0.15} name="SS.ge" logo={<SSIcon className="w-3 h-3" />} color="text-[#061b31] dark:text-white" bg="bg-gray-100 dark:bg-white/5" />
            <MockPlatformSwitch active={false} name="MyHome" logo={<MyHomeIcon className="w-3 h-3" />} color="text-[#061b31] dark:text-white" bg="bg-gray-100 dark:bg-white/5" />
          </div>
        </div>
      </div>

      {/* Bottom Button Area */}
      <div className="absolute bottom-5 left-4 right-4 bg-white/80 dark:bg-[#050505]/80 backdrop-blur-sm pt-2 pb-1 transition-colors">
        <motion.div 
          animate={phase >= 5 ? { scale: 0.98, opacity: 0.9 } : { scale: 1, opacity: 1 }}
          className="w-full py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors duration-300"
          style={{ backgroundColor: phase >= 5 ? '#15be53' : '#533afd' }}
        >
          <span className="font-medium text-[14px] text-white flex gap-2 items-center">
            {phase === 5 && <Sparkles size={14} className="animate-pulse" />}
            {phase === 5 ? t.btnPublishing : t.btnPublish}
          </span>
        </motion.div>
      </div>

      {/* Success Toast INSIDE the phone */}
      <AnimatePresence>
        {phase === 6 && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`absolute bottom-6 left-4 right-4 bg-white dark:bg-[#111111] p-4 rounded-xl flex items-center gap-3 z-50 pointer-events-none border border-[#e5edf5] dark:border-white/10 ${ELEVATE_SHADOW} transition-colors`}
          >
            <div className="w-10 h-10 bg-[#15be53]/10 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} className="text-[#15be53]" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-[#061b31] dark:text-white leading-tight">{t.successTitle}</p>
              <p className="text-[12px] font-normal text-[#64748d] dark:text-gray-400 mt-0.5">{t.successDesc}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

function MockPlatformSwitch({ active, name, logo, color, bg, delay = 0 }: any) {
  return (
    <div className="flex items-center justify-between p-1.5 px-2 rounded-xl bg-white dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 shadow-sm dark:shadow-none transition-colors">
      <div className="flex items-center gap-1.5 pt-0.5">
        <div className={`w-5 h-5 rounded-md ${bg} flex items-center justify-center ${color} font-bold text-[9px] transition-colors`}>
          {logo}
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#061b31] dark:text-white/90 truncate max-w-[40px]">{name}</p>
        </div>
      </div>
      <div className={`w-6 h-3.5 rounded-full p-0.5 transition-colors duration-300 flex items-center ${active ? 'bg-[#15be53]' : 'bg-[#e5edf5] dark:bg-white/10'}`}>
        <motion.div 
          initial={false}
          animate={{ x: active ? 10 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30, delay: active ? delay : 0 }}
          className="w-2.5 h-2.5 bg-white rounded-full shadow-sm"
        />
      </div>
    </div>
  );
}
